import type { KafkaProfileDraft } from './types';

export interface KafkaPartitionInfo {
  partition: number;
  leader: number;
  replicas: number[];
  isr: number[];
  low: string;
  high: string;
}

export interface KafkaTopicInfo {
  name: string;
  internal: boolean;
  replicationFactor: number;
  messageCount: number;
  partitions: KafkaPartitionInfo[];
}

export interface KafkaTopicConfigEntry {
  name: string;
  value: string | null;
  isDefault: boolean;
  readOnly: boolean;
  sensitive: boolean;
}

export interface KafkaTopicCreation {
  name: string;
  partitions: number;
  replicationFactor: number;
  configs: Record<string, string>;
}

export interface KafkaGroupSummary {
  groupId: string;
  state: string;
  protocol: string;
  protocolType: string;
  memberCount: number;
}

export interface KafkaGroupAssignment {
  topic: string;
  partitions: number[];
}

export interface KafkaGroupMember {
  memberId: string;
  clientId: string;
  host: string;
  assignments: KafkaGroupAssignment[];
}

export interface KafkaGroupOffset {
  topic: string;
  partition: number;
  committed: string | null;
  logEnd: string;
  lag: number;
}

export interface KafkaGroupDetail {
  groupId: string;
  state: string;
  protocol: string;
  members: KafkaGroupMember[];
  offsets: KafkaGroupOffset[];
  totalLag: number;
}

export interface KafkaBrokerInfo {
  nodeId: number;
  host: string;
  port: number;
  isController: boolean;
}

export interface KafkaClusterInfo {
  clusterId: string;
  controllerId: number;
  brokers: KafkaBrokerInfo[];
  version?: string;
}

export type KafkaOffsetResetTarget = { kind: 'earliest' } | { kind: 'latest' } | { kind: 'timestamp'; timestamp: number };

export type KafkaAdminCommand =
  | { kind: 'listTopics' }
  | { kind: 'describeTopicConfigs'; topic: string }
  | { kind: 'createTopic'; topic: KafkaTopicCreation }
  | { kind: 'deleteTopic'; topic: string }
  | { kind: 'alterTopicConfigs'; topic: string; changes: Record<string, string | null>; validateOnly: boolean }
  | { kind: 'increasePartitions'; topic: string; totalPartitions: number }
  | { kind: 'listGroups' }
  | { kind: 'describeGroup'; groupId: string }
  | { kind: 'deleteGroup'; groupId: string }
  | { kind: 'resetGroupOffsets'; groupId: string; target: KafkaOffsetResetTarget }
  | { kind: 'describeCluster' };

export type KafkaAdminCommandKind = KafkaAdminCommand['kind'];

export type KafkaAdminData =
  | { kind: 'topics'; topics: KafkaTopicInfo[] }
  | { kind: 'topicConfigs'; topic: string; configs: KafkaTopicConfigEntry[] }
  | { kind: 'groups'; groups: KafkaGroupSummary[] }
  | { kind: 'group'; group: KafkaGroupDetail }
  | { kind: 'cluster'; cluster: KafkaClusterInfo }
  | { kind: 'done'; message: string };

export interface KafkaAdminResult {
  requestId: string;
  command: KafkaAdminCommandKind;
  data?: KafkaAdminData;
  error?: string;
}

export interface KafkaAdminRequestMessage {
  type: 'adminRequest';
  requestId: string;
  profile: KafkaProfileDraft;
  command: KafkaAdminCommand;
}

export type KafkaAdminHostMessage =
  | { type: 'adminResult'; result: KafkaAdminResult }
  | { type: 'adminSettings'; refreshIntervalSeconds: number };
