import { KafkaTopicConfigEntry } from '../../shared/kafkaAdminTypes';
import { MAX_PARTITIONS } from './admin';

export type TopicConfigChanges = Record<string, string | null>;

export interface ConfigUpdateEntry {
  name: string;
  value: string;
}

export interface ConfigUpdatePlan {
  entries: ConfigUpdateEntry[];
  error?: string;
}

export const EDITABLE_TOPIC_CONFIGS = ['retention.ms', 'cleanup.policy', 'max.message.bytes', 'min.insync.replicas', 'retention.bytes', 'segment.bytes', 'compression.type'];

const BROKER_VERSION_CONFIGS = ['inter.broker.protocol.version', 'log.message.format.version'];

export function isEditableConfig(entry: KafkaTopicConfigEntry): boolean {
  return !entry.readOnly && !entry.sensitive;
}

function isPreservedOverride(entry: KafkaTopicConfigEntry): boolean {
  return !entry.isDefault && isEditableConfig(entry) && entry.value !== null;
}

function findLockedEntry(configs: KafkaTopicConfigEntry[], names: string[]): KafkaTopicConfigEntry | undefined {
  return configs.find((entry) => names.includes(entry.name) && !isEditableConfig(entry));
}

export function planConfigUpdate(current: KafkaTopicConfigEntry[], changes: TopicConfigChanges): ConfigUpdatePlan {
  const locked = findLockedEntry(current, Object.keys(changes));
  if (locked) {
    return { entries: [], error: `Config "${locked.name}" is ${locked.sensitive ? 'sensitive' : 'read-only'} and cannot be changed` };
  }
  const hiddenOverride = current.find((entry) => !entry.isDefault && entry.sensitive && !(entry.name in changes));
  if (hiddenOverride) {
    return { entries: [], error: `Cannot update safely: sensitive override "${hiddenOverride.name}" would be reset by the broker` };
  }
  const merged = new Map(current.filter(isPreservedOverride).map((entry) => [entry.name, entry.value as string]));
  Object.entries(changes).forEach(([name, value]) => (value === null ? merged.delete(name) : merged.set(name, value)));
  return { entries: [...merged].map(([name, value]) => ({ name, value })) };
}

function changeFor(entry: KafkaTopicConfigEntry, edit: string | null): string | null | undefined {
  if (edit === null) {
    return entry.isDefault ? undefined : null;
  }
  return edit.trim() === (entry.value ?? '') ? undefined : edit.trim();
}

export function diffConfigChanges(current: KafkaTopicConfigEntry[], edits: Record<string, string | null>): TopicConfigChanges {
  const byName = new Map(current.map((entry) => [entry.name, entry]));
  const changes: TopicConfigChanges = {};
  Object.entries(edits).forEach(([name, edit]) => {
    const entry = byName.get(name);
    const change = entry && isEditableConfig(entry) ? changeFor(entry, edit) : undefined;
    change !== undefined && (changes[name] = change);
  });
  return changes;
}

export function describeConfigChanges(changes: TopicConfigChanges): string {
  return Object.entries(changes)
    .map(([name, value]) => (value === null ? `${name} → default` : `${name} = ${value}`))
    .join(', ');
}

export function validatePartitionIncrease(current: number, requested: number): string | undefined {
  if (!Number.isInteger(requested) || requested <= current) {
    return `Partitions can only be increased: enter a whole number greater than ${current}`;
  }
  return requested > MAX_PARTITIONS ? `Partitions must be at most ${MAX_PARTITIONS}` : undefined;
}

export function formatBrokerVersion(entries: ConfigUpdateEntry[]): string | undefined {
  for (const name of BROKER_VERSION_CONFIGS) {
    const found = entries.find((entry) => entry.name === name && entry.value);
    if (found) {
      return `${name}: ${found.value}`;
    }
  }
  return undefined;
}
