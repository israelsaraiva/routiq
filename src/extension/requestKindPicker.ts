import * as vscode from 'vscode';
import { RequestKind } from '../shared/types';

interface KindOption extends vscode.QuickPickItem {
  requestKind: RequestKind;
}

const KIND_OPTIONS: KindOption[] = [
  { requestKind: 'http', label: '$(symbol-event) HTTP', description: 'REST request / response' },
  { requestKind: 'sse', label: '$(broadcast) Server-Sent Events', description: 'Live event stream over HTTP' },
  { requestKind: 'websocket', label: '$(plug) WebSocket', description: 'Bidirectional message channel' },
  { requestKind: 'grpc', label: '$(server-process) gRPC', description: 'Unary and streaming calls from .proto files' },
  { requestKind: 'graphql', label: '$(type-hierarchy) GraphQL', description: 'Queries with schema explorer and variables' },
];

export async function pickRequestKind(): Promise<RequestKind | undefined> {
  const picked = await vscode.window.showQuickPick(KIND_OPTIONS, { placeHolder: 'Request type' });
  return picked?.requestKind;
}
