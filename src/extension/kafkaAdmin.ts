import { AssignerProtocol, ConfigResourceTypes, Kafka } from 'kafkajs';
import {
  RawCommittedOffset,
  RawGroupDescription,
  RawPartitionOffsets,
  RawTopicMetadata,
  NO_COMMITTED_OFFSET,
  buildGroupDetail,
  buildGroupOffsets,
  canModifyGroup,
  describeAdminError,
  resolveResetOffset,
  summarizeGroup,
  summarizeTopic,
  topicsOfGroup,
} from '../core/kafka/admin';
import { KafkaConnectionConfig } from '../core/kafka/connection';
import {
  KafkaAdminCommand,
  KafkaAdminData,
  KafkaAdminResult,
  KafkaClusterInfo,
  KafkaOffsetResetTarget,
  KafkaTopicConfigEntry,
  KafkaTopicCreation,
  KafkaTopicInfo,
} from '../shared/kafkaAdminTypes';
import { toKafkaConfig } from './kafkaClient';

export interface KafkaAdminLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTopics(): Promise<string[]>;
  describeTopics(topics: string[]): Promise<RawTopicMetadata[]>;
  fetchTopicOffsets(topic: string): Promise<RawPartitionOffsets[]>;
  fetchOffsetsByTimestamp(topic: string, timestamp: number): Promise<Array<{ partition: number; offset: string }>>;
  describeTopicConfigs(topic: string): Promise<KafkaTopicConfigEntry[]>;
  createTopic(creation: KafkaTopicCreation): Promise<boolean>;
  deleteTopic(topic: string): Promise<void>;
  listGroups(): Promise<Array<{ groupId: string; protocolType: string }>>;
  describeGroups(groupIds: string[]): Promise<RawGroupDescription[]>;
  deleteGroup(groupId: string): Promise<void>;
  fetchGroupOffsets(groupId: string, topics: string[]): Promise<RawCommittedOffset[]>;
  setGroupOffsets(groupId: string, topic: string, partitions: Array<{ partition: number; offset: string }>): Promise<void>;
  describeCluster(): Promise<{ clusterId: string; controllerId: number; brokers: Array<{ nodeId: number; host: string; port: number }> }>;
}

export type KafkaAdminFactory = (config: KafkaConnectionConfig, clientId: string, timeoutMs: number) => KafkaAdminLike;

export interface KafkaAdminOptions {
  timeoutMs: number;
}

const ADMIN_CLIENT_ID = 'routiq-admin';
const OFFSET_FETCH_CONCURRENCY = 8;
const SENSITIVE_PLACEHOLDER = '********';

function decodeAssignment(buffer: Buffer): Record<string, number[]> {
  return buffer.length === 0 ? {} : AssignerProtocol.MemberAssignment.decode(buffer)?.assignment ?? {};
}

export const createKafkaAdmin: KafkaAdminFactory = (config, clientId, timeoutMs) => {
  const admin = new Kafka(toKafkaConfig(config, clientId, timeoutMs)).admin();
  return {
    connect: () => admin.connect(),
    disconnect: () => admin.disconnect(),
    listTopics: () => admin.listTopics(),
    describeTopics: async (topics) => {
      const { topics: metadata } = await admin.fetchTopicMetadata({ topics });
      return metadata.map(({ name, partitions }) => ({
        name,
        partitions: partitions.map(({ partitionId, leader, replicas, isr }) => ({ partition: partitionId, leader, replicas, isr })),
      }));
    },
    fetchTopicOffsets: async (topic) => (await admin.fetchTopicOffsets(topic)).map(({ partition, low, high }) => ({ partition, low, high })),
    fetchOffsetsByTimestamp: async (topic, timestamp) =>
      (await admin.fetchTopicOffsetsByTimestamp(topic, timestamp)).map(({ partition, offset }) => ({ partition, offset })),
    describeTopicConfigs: async (topic) => {
      const { resources } = await admin.describeConfigs({ includeSynonyms: false, resources: [{ type: ConfigResourceTypes.TOPIC, name: topic }] });
      return (resources[0]?.configEntries ?? []).map((entry) => ({
        name: entry.configName,
        value: entry.isSensitive ? SENSITIVE_PLACEHOLDER : entry.configValue,
        isDefault: entry.isDefault,
        readOnly: entry.readOnly,
        sensitive: entry.isSensitive,
      }));
    },
    createTopic: ({ name, partitions, replicationFactor, configs }) =>
      admin.createTopics({
        waitForLeaders: true,
        topics: [{ topic: name, numPartitions: partitions, replicationFactor, configEntries: Object.entries(configs).map(([key, value]) => ({ name: key, value })) }],
      }),
    deleteTopic: (topic) => admin.deleteTopics({ topics: [topic] }),
    listGroups: async () => (await admin.listGroups()).groups,
    describeGroups: async (groupIds) =>
      (await admin.describeGroups(groupIds)).groups.map(({ groupId, state, protocol, protocolType, members }) => ({
        groupId,
        state,
        protocol,
        protocolType,
        members: members.map((member) => ({
          memberId: member.memberId,
          clientId: member.clientId,
          host: member.clientHost,
          assignment: decodeAssignment(member.memberAssignment),
        })),
      })),
    deleteGroup: async (groupId) => void (await admin.deleteGroups([groupId])),
    fetchGroupOffsets: async (groupId, topics) =>
      (await admin.fetchOffsets({ groupId, topics })).flatMap(({ topic, partitions }) => partitions.map(({ partition, offset }) => ({ topic, partition, offset }))),
    setGroupOffsets: (groupId, topic, partitions) => admin.setOffsets({ groupId, topic, partitions }),
    describeCluster: async () => {
      const { clusterId, controller, brokers } = await admin.describeCluster();
      return { clusterId, controllerId: controller ?? -1, brokers };
    },
  };
};

function withTimeout<Value>(work: Promise<Value>, timeoutMs: number): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function mapWithConcurrency<Item, Result>(items: Item[], limit: number, work: (item: Item) => Promise<Result>): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function groupNotModifiable(groupId: string, state: string, action: string): Error {
  return new Error(`Cannot ${action} group "${groupId}" while it is ${state}. Stop all its consumers first (the group must be empty).`);
}

export class KafkaAdminService {
  constructor(
    private readonly createAdmin: KafkaAdminFactory,
    private readonly options: KafkaAdminOptions,
  ) {}

  async handle(config: KafkaConnectionConfig, requestId: string, command: KafkaAdminCommand): Promise<KafkaAdminResult> {
    try {
      return { requestId, command: command.kind, data: await this.execute(config, command) };
    } catch (error) {
      return { requestId, command: command.kind, error: describeAdminError(error) };
    }
  }

  async execute(config: KafkaConnectionConfig, command: KafkaAdminCommand): Promise<KafkaAdminData> {
    const admin = this.createAdmin(config, ADMIN_CLIENT_ID, this.options.timeoutMs);
    try {
      return await withTimeout(this.connectAndRun(admin, command), this.options.timeoutMs);
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  private async connectAndRun(admin: KafkaAdminLike, command: KafkaAdminCommand): Promise<KafkaAdminData> {
    await admin.connect();
    switch (command.kind) {
      case 'listTopics':
        return { kind: 'topics', topics: await this.listTopics(admin) };
      case 'describeTopicConfigs':
        return { kind: 'topicConfigs', topic: command.topic, configs: await admin.describeTopicConfigs(command.topic) };
      case 'createTopic':
        return this.createTopic(admin, command.topic);
      case 'deleteTopic':
        await admin.deleteTopic(command.topic);
        return { kind: 'done', message: `Deleted topic "${command.topic}"` };
      case 'listGroups':
        return { kind: 'groups', groups: await this.listGroups(admin) };
      case 'describeGroup':
        return { kind: 'group', group: await this.describeGroup(admin, command.groupId) };
      case 'deleteGroup':
        return this.deleteGroup(admin, command.groupId);
      case 'resetGroupOffsets':
        return this.resetGroupOffsets(admin, command.groupId, command.target);
      case 'describeCluster':
        return { kind: 'cluster', cluster: await this.describeCluster(admin) };
    }
  }

  private async listTopics(admin: KafkaAdminLike): Promise<KafkaTopicInfo[]> {
    const names = await admin.listTopics();
    const metadata = names.length > 0 ? await admin.describeTopics(names) : [];
    const offsets = await mapWithConcurrency(metadata, OFFSET_FETCH_CONCURRENCY, (topic) => this.safeTopicOffsets(admin, topic.name));
    return metadata.map((topic, index) => summarizeTopic(topic, offsets[index])).sort((left, right) => left.name.localeCompare(right.name));
  }

  private safeTopicOffsets(admin: KafkaAdminLike, topic: string): Promise<RawPartitionOffsets[]> {
    return admin.fetchTopicOffsets(topic).catch(() => []);
  }

  private async createTopic(admin: KafkaAdminLike, creation: KafkaTopicCreation): Promise<KafkaAdminData> {
    const created = await admin.createTopic(creation);
    return { kind: 'done', message: created ? `Created topic "${creation.name}"` : `Topic "${creation.name}" already exists` };
  }

  private async listGroups(admin: KafkaAdminLike) {
    const listed = await admin.listGroups();
    const descriptions = listed.length > 0 ? await admin.describeGroups(listed.map((group) => group.groupId)) : [];
    return descriptions.map(summarizeGroup).sort((left, right) => left.groupId.localeCompare(right.groupId));
  }

  private async describeOneGroup(admin: KafkaAdminLike, groupId: string): Promise<RawGroupDescription> {
    const [description] = await admin.describeGroups([groupId]);
    if (!description) {
      throw new Error(`Consumer group "${groupId}" not found`);
    }
    return description;
  }

  private async committedOffsets(admin: KafkaAdminLike, description: RawGroupDescription): Promise<RawCommittedOffset[]> {
    const assignedTopics = topicsOfGroup([], description.members);
    const candidates = [...new Set([...(await admin.listTopics()), ...assignedTopics])];
    const committed = await admin.fetchGroupOffsets(description.groupId, candidates);
    const relevantTopics = new Set([...assignedTopics, ...committed.filter((entry) => entry.offset !== NO_COMMITTED_OFFSET).map((entry) => entry.topic)]);
    return committed.filter((entry) => relevantTopics.has(entry.topic));
  }

  private async watermarksFor(admin: KafkaAdminLike, topics: string[]): Promise<Map<string, RawPartitionOffsets[]>> {
    const entries = await mapWithConcurrency(topics, OFFSET_FETCH_CONCURRENCY, async (topic) => [topic, await admin.fetchTopicOffsets(topic)] as const);
    return new Map(entries);
  }

  private async describeGroup(admin: KafkaAdminLike, groupId: string) {
    const description = await this.describeOneGroup(admin, groupId);
    const committed = await this.committedOffsets(admin, description);
    const watermarks = await this.watermarksFor(admin, topicsOfGroup(committed, description.members));
    return buildGroupDetail(description, buildGroupOffsets(committed, watermarks));
  }

  private async deleteGroup(admin: KafkaAdminLike, groupId: string): Promise<KafkaAdminData> {
    const { state } = await this.describeOneGroup(admin, groupId);
    if (!canModifyGroup(state)) {
      throw groupNotModifiable(groupId, state, 'delete');
    }
    await admin.deleteGroup(groupId);
    return { kind: 'done', message: `Deleted consumer group "${groupId}"` };
  }

  private async resetGroupOffsets(admin: KafkaAdminLike, groupId: string, target: KafkaOffsetResetTarget): Promise<KafkaAdminData> {
    const description = await this.describeOneGroup(admin, groupId);
    if (!canModifyGroup(description.state)) {
      throw groupNotModifiable(groupId, description.state, 'reset offsets of');
    }
    const committed = await this.committedOffsets(admin, description);
    const topics = topicsOfGroup(committed, description.members);
    for (const topic of topics) {
      await this.resetTopicOffsets(admin, groupId, topic, target);
    }
    return { kind: 'done', message: `Reset offsets of "${groupId}" on ${topics.length} topic(s)` };
  }

  private async resetTopicOffsets(admin: KafkaAdminLike, groupId: string, topic: string, target: KafkaOffsetResetTarget): Promise<void> {
    const bounds = await admin.fetchTopicOffsets(topic);
    const byTimestamp = target.kind === 'timestamp' ? await admin.fetchOffsetsByTimestamp(topic, target.timestamp) : [];
    const partitions = bounds.map((entry) => ({
      partition: entry.partition,
      offset: resolveResetOffset(target, entry, byTimestamp.find((candidate) => candidate.partition === entry.partition)?.offset),
    }));
    await admin.setGroupOffsets(groupId, topic, partitions);
  }

  private async describeCluster(admin: KafkaAdminLike): Promise<KafkaClusterInfo> {
    const { clusterId, controllerId, brokers } = await admin.describeCluster();
    return {
      clusterId,
      controllerId,
      brokers: brokers.map((broker) => ({ ...broker, isController: broker.nodeId === controllerId })).sort((left, right) => left.nodeId - right.nodeId),
    };
  }
}
