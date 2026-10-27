import {
  KafkaGroupAssignment,
  KafkaGroupDetail,
  KafkaGroupMember,
  KafkaGroupOffset,
  KafkaGroupSummary,
  KafkaOffsetResetTarget,
  KafkaPartitionInfo,
  KafkaTopicCreation,
  KafkaTopicInfo,
} from '../../shared/kafkaAdminTypes';
import { describeKafkaError, parseTopicList } from './connection';

export interface RawPartitionMetadata {
  partition: number;
  leader: number;
  replicas: number[];
  isr: number[];
}

export interface RawTopicMetadata {
  name: string;
  partitions: RawPartitionMetadata[];
}

export interface RawPartitionOffsets {
  partition: number;
  low: string;
  high: string;
}

export interface RawGroupMember {
  memberId: string;
  clientId: string;
  host: string;
  assignment: Record<string, number[]>;
}

export interface RawGroupDescription {
  groupId: string;
  state: string;
  protocol: string;
  protocolType: string;
  members: RawGroupMember[];
}

export interface RawCommittedOffset {
  topic: string;
  partition: number;
  offset: string;
}

export interface TopicCreationInput {
  name: string;
  partitions: string;
  replicationFactor: string;
  configText: string;
}

export const INTERNAL_TOPIC_PREFIX = '__';
export const MAX_TOPIC_NAME_LENGTH = 249;
export const MAX_PARTITIONS = 10000;
export const NO_COMMITTED_OFFSET = '-1';
export const RESETTABLE_GROUP_STATES = ['Empty', 'Dead'];

const TOPIC_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const CONFIG_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isInternalTopic(name: string): boolean {
  return name.startsWith(INTERNAL_TOPIC_PREFIX);
}

export function offsetDistance(low: string, high: string): number {
  const distance = BigInt(high) - BigInt(low);
  return distance > 0n ? Number(distance) : 0;
}

export function summarizeTopic(metadata: RawTopicMetadata, offsets: RawPartitionOffsets[]): KafkaTopicInfo {
  const offsetsByPartition = new Map(offsets.map((entry) => [entry.partition, entry]));
  const partitions: KafkaPartitionInfo[] = metadata.partitions
    .map((partition) => ({ ...partition, low: offsetsByPartition.get(partition.partition)?.low ?? '0', high: offsetsByPartition.get(partition.partition)?.high ?? '0' }))
    .sort((left, right) => left.partition - right.partition);
  return {
    name: metadata.name,
    internal: isInternalTopic(metadata.name),
    replicationFactor: partitions[0]?.replicas.length ?? 0,
    messageCount: partitions.reduce((total, partition) => total + offsetDistance(partition.low, partition.high), 0),
    partitions,
  };
}

export function filterTopics(topics: KafkaTopicInfo[], query: string, showInternal: boolean): KafkaTopicInfo[] {
  const needle = query.trim().toLowerCase();
  return topics.filter((topic) => (showInternal || !topic.internal) && topic.name.toLowerCase().includes(needle));
}

export function isUnderReplicated(partition: KafkaPartitionInfo): boolean {
  return partition.isr.length < partition.replicas.length;
}

export function calculateLag(committed: string | null, low: string, high: string): number {
  const hasValidCommit = committed !== null && committed !== NO_COMMITTED_OFFSET && BigInt(committed) >= BigInt(low);
  return offsetDistance(hasValidCommit ? committed : low, high);
}

export function buildGroupOffsets(committed: RawCommittedOffset[], watermarks: Map<string, RawPartitionOffsets[]>): KafkaGroupOffset[] {
  return committed
    .map(({ topic, partition, offset }) => {
      const bounds = watermarks.get(topic)?.find((entry) => entry.partition === partition) ?? { partition, low: '0', high: '0' };
      const hasCommit = offset !== NO_COMMITTED_OFFSET;
      return { topic, partition, committed: hasCommit ? offset : null, logEnd: bounds.high, lag: calculateLag(offset, bounds.low, bounds.high) };
    })
    .sort((left, right) => left.topic.localeCompare(right.topic) || left.partition - right.partition);
}

function toAssignments(assignment: Record<string, number[]>): KafkaGroupAssignment[] {
  return Object.entries(assignment)
    .map(([topic, partitions]) => ({ topic, partitions: [...partitions].sort((left, right) => left - right) }))
    .sort((left, right) => left.topic.localeCompare(right.topic));
}

export function toGroupMembers(members: RawGroupMember[]): KafkaGroupMember[] {
  return members.map(({ memberId, clientId, host, assignment }) => ({ memberId, clientId, host, assignments: toAssignments(assignment) }));
}

export function buildGroupDetail(description: RawGroupDescription, offsets: KafkaGroupOffset[]): KafkaGroupDetail {
  return {
    groupId: description.groupId,
    state: description.state,
    protocol: description.protocol,
    members: toGroupMembers(description.members),
    offsets,
    totalLag: offsets.reduce((total, offset) => total + offset.lag, 0),
  };
}

export function summarizeGroup(description: RawGroupDescription): KafkaGroupSummary {
  return {
    groupId: description.groupId,
    state: description.state,
    protocol: description.protocol,
    protocolType: description.protocolType,
    memberCount: description.members.length,
  };
}

export function canModifyGroup(state: string): boolean {
  return RESETTABLE_GROUP_STATES.includes(state);
}

export function topicsOfGroup(committed: RawCommittedOffset[], members: RawGroupMember[]): string[] {
  const assigned = members.flatMap((member) => Object.keys(member.assignment));
  return [...new Set([...committed.map((entry) => entry.topic), ...assigned])].sort();
}

export function resolveResetOffset(target: KafkaOffsetResetTarget, bounds: RawPartitionOffsets, timestampOffset: string | undefined): string {
  if (target.kind === 'earliest') {
    return bounds.low;
  }
  const hasMessageAtOrAfterTimestamp = target.kind === 'timestamp' && timestampOffset !== undefined && timestampOffset !== NO_COMMITTED_OFFSET;
  return hasMessageAtOrAfterTimestamp ? timestampOffset : bounds.high;
}

function parseWholeNumber(text: string): number | undefined {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
}

export interface ParsedTopicConfigs {
  configs: Record<string, string>;
  error?: string;
}

export function parseTopicConfigText(text: string): ParsedTopicConfigs {
  const configs: Record<string, string> = {};
  for (const line of text.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const separator = line.indexOf('=');
    const name = separator > 0 ? line.slice(0, separator).trim() : '';
    if (!CONFIG_NAME_PATTERN.test(name) || separator === line.length - 1) {
      return { configs: {}, error: `Invalid config "${line}". Use one name=value per line.` };
    }
    configs[name] = line.slice(separator + 1).trim();
  }
  return { configs };
}

function validateTopicName(name: string): string | undefined {
  if (!name) {
    return 'Topic name is required';
  }
  if (name === '.' || name === '..' || !TOPIC_NAME_PATTERN.test(name)) {
    return 'Topic name may only contain letters, digits, ".", "_" and "-"';
  }
  return name.length > MAX_TOPIC_NAME_LENGTH ? `Topic name must be at most ${MAX_TOPIC_NAME_LENGTH} characters` : undefined;
}

export function validateTopicCreation(input: TopicCreationInput): string | undefined {
  const partitions = parseWholeNumber(input.partitions);
  const replicationFactor = parseWholeNumber(input.replicationFactor);
  if (partitions === undefined || partitions < 1 || partitions > MAX_PARTITIONS) {
    return `Partitions must be a whole number between 1 and ${MAX_PARTITIONS}`;
  }
  if (replicationFactor === undefined || replicationFactor < 1) {
    return 'Replication factor must be a whole number of at least 1';
  }
  return validateTopicName(input.name.trim()) ?? parseTopicConfigText(input.configText).error;
}

export function buildTopicCreation(input: TopicCreationInput): KafkaTopicCreation {
  return {
    name: input.name.trim(),
    partitions: Number(input.partitions.trim()),
    replicationFactor: Number(input.replicationFactor.trim()),
    configs: parseTopicConfigText(input.configText).configs,
  };
}

const AUTHORIZATION_ERRORS: Record<string, string> = {
  TOPIC_AUTHORIZATION_FAILED: 'Not authorized to access this topic. Ask a Kafka administrator for the required ACL (Describe/Create/Delete on the topic).',
  GROUP_AUTHORIZATION_FAILED: 'Not authorized to access this consumer group. Ask a Kafka administrator for the required ACL (Describe/Delete/Read on the group).',
  CLUSTER_AUTHORIZATION_FAILED: 'Not authorized to perform this cluster operation. Ask a Kafka administrator for the required cluster ACL.',
  SASL_AUTHENTICATION_FAILED: 'Authentication failed. Check the SASL mechanism, username and password.',
};

function kafkaErrorType(error: unknown): string | undefined {
  return (error as { type?: string } | null)?.type;
}

export function describeAdminError(error: unknown): string {
  const type = kafkaErrorType(error);
  return (type && AUTHORIZATION_ERRORS[type]) || describeKafkaError(error);
}

export function addTopicToList(topicsText: string, topic: string): string {
  const topics = parseTopicList(topicsText);
  return (topics.includes(topic) ? topics : [...topics, topic]).join(',');
}
