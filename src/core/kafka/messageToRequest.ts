import { KafkaSaveAsRequestItem } from '../../shared/kafkaMessageTypes';
import { KafkaMessage, RequestModel } from '../../shared/types';
import { createRequest } from '../factories';
import { formatMessageContent } from './messageParsing';

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function buildSaveItems(messages: KafkaMessage[]): KafkaSaveAsRequestItem[] {
  return messages.map((message, index) => ({
    name: messages.length > 1 ? `${message.topic}/${message.flowId} #${index + 1}` : `${message.topic}/${message.flowId}`,
    headers: message.headers ?? {},
    body: message.value,
  }));
}

export function buildRequestFromItem({ name, headers, body }: KafkaSaveAsRequestItem, newId?: () => string): RequestModel {
  const request = createRequest(name, newId);
  const json = isJson(body);
  return {
    ...request,
    method: 'POST',
    headers: Object.entries(headers).map(([key, value]) => ({ key, value, enabled: true })),
    body: { ...request.body, type: json ? 'json' : 'text', text: json ? formatMessageContent(body) : body },
  };
}
