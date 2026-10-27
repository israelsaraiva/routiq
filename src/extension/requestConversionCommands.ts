import * as vscode from 'vscode';
import { ConversionTarget, convertRequest, describeConversion } from '../core/requestConversion';
import { RequestModel } from '../shared/types';
import { Storage } from './storage';

const UNDO_ACTION = 'Undo';

function restoreIfUnchanged(storage: Storage, previous: RequestModel, converted: RequestModel): void {
  const current = storage.findRequest(previous.id)?.request;
  if (current && JSON.stringify(current) === JSON.stringify(converted)) {
    storage.updateRequest(previous);
  }
}

export async function convertStoredRequest(storage: Storage, requestId: string, target: ConversionTarget): Promise<void> {
  const previous = storage.findRequest(requestId)?.request;
  if (!previous) {
    return;
  }
  const { request: converted, warnings } = convertRequest(previous, target);
  storage.updateRequest(converted);
  const message = describeConversion(target, warnings);
  const action =
    warnings.length > 0 ? await vscode.window.showWarningMessage(message, UNDO_ACTION) : await vscode.window.showInformationMessage(message, UNDO_ACTION);
  if (action === UNDO_ACTION) {
    restoreIfUnchanged(storage, previous, converted);
  }
}
