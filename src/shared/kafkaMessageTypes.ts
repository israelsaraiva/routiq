export type KafkaValueFormat = 'auto' | 'json' | 'text' | 'hex' | 'base64' | 'avro';

export type KafkaDecodedFormat = 'json' | 'text' | 'avro' | 'json-schema' | 'protobuf' | 'binary';

export type KafkaMessageViewMode = 'tree' | 'text' | 'raw';

export type KafkaFilterScope = 'all' | 'key' | 'value' | 'headers';

export interface KafkaMessageFilter {
  text: string;
  regex: boolean;
  caseSensitive: boolean;
  scope: KafkaFilterScope;
  jsonPath: string;
  headerKey: string;
  headerValue: string;
  partition: number | null;
  fromTime: number | null;
  toTime: number | null;
  errorsOnly: boolean;
}

export interface KafkaSavedFilter {
  id: string;
  name: string;
  filter: KafkaMessageFilter;
}

export interface KafkaFilterView {
  id: string;
  name: string;
  topic: string | null;
  filter: KafkaMessageFilter;
}

export type KafkaRuleMatchType = 'text' | 'regex' | 'jsonpath';

export interface KafkaHighlightRule {
  id: string;
  name: string;
  matchType: KafkaRuleMatchType;
  pattern: string;
  color: string;
  notify: boolean;
  badge: boolean;
  enabled: boolean;
}

export interface KafkaUiState {
  savedFilters: KafkaSavedFilter[];
  views: KafkaFilterView[];
  rules: KafkaHighlightRule[];
  viewMode: KafkaMessageViewMode;
}

export interface KafkaDecodedValue {
  format: KafkaDecodedFormat;
  text: string;
  schemaId?: number;
  error?: string;
}

export interface KafkaSaveAsRequestItem {
  name: string;
  headers: Record<string, string>;
  body: string;
}

export type KafkaMessageFeatureHostMessage =
  | { type: 'kafkaUiState'; ui: KafkaUiState }
  | { type: 'kafkaDecoded'; messageId: string; decoded: KafkaDecodedValue };

export type KafkaMessageFeatureWebviewMessage =
  | { type: 'kafkaSaveUiState'; ui: Partial<KafkaUiState> }
  | { type: 'kafkaDecode'; messageId: string; base64: string; format: KafkaValueFormat }
  | { type: 'kafkaRuleHit'; ruleName: string; count: number; sample: string }
  | { type: 'kafkaSaveAsRequest'; items: KafkaSaveAsRequestItem[] };
