export interface ProtobufSettings {
  file?: string;
  messageType?: string;
  topicTypes?: string;
}

const ENTRY_SEPARATOR = /[\n,;]+/;

export function parseTopicTypes(text: string | undefined): Map<string, string> {
  const entries = (text ?? '')
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.split('=').map((part) => part.trim()))
    .filter(([topic, type]) => topic && type);
  return new Map(entries.map(([topic, type]) => [topic, type] as [string, string]));
}

export function resolveMessageType(settings: ProtobufSettings | undefined, topic: string): string | undefined {
  const type = parseTopicTypes(settings?.topicTypes).get(topic) ?? settings?.messageType?.trim();
  return type || undefined;
}

export function hasLocalProtobuf(settings: ProtobufSettings | undefined): settings is ProtobufSettings & { file: string } {
  return Boolean(settings?.file?.trim());
}
