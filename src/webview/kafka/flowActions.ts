import { FlowGroup, buildFlowExport, flowExportFileName } from '../../core/kafka/flowGroups';
import { buildMessageExport, buildMessagesExport } from '../../core/kafka/messageParsing';
import { KafkaMessage } from '../../shared/types';
import { postKafkaMessage } from '../vscodeApi';

export function copyMessage(message: KafkaMessage): void {
  postKafkaMessage({ type: 'kafkaCopy', text: JSON.stringify(buildMessageExport(message), null, 2) });
}

export function copyMessages(messages: KafkaMessage[]): void {
  postKafkaMessage({ type: 'kafkaCopy', text: buildMessagesExport(messages) });
}

export function copyFlow(group: FlowGroup): void {
  postKafkaMessage({ type: 'kafkaCopy', text: buildFlowExport(group) });
}

export function downloadFlow(group: FlowGroup): void {
  postKafkaMessage({ type: 'kafkaSaveFile', suggestedName: flowExportFileName(group, new Date()), content: buildFlowExport(group) });
}
