import { InfoWebviewMessage } from '../core/infoMessages';
import { RunnerWebviewMessage } from '../core/runnerMessages';
import { WebviewToHostMessage } from '../shared/types';

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage | RunnerWebviewMessage | InfoWebviewMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export function postToHost(message: WebviewToHostMessage): void {
  api.postMessage(message);
}

export function postRunnerMessage(message: RunnerWebviewMessage): void {
  api.postMessage(message);
}

export function postInfoMessage(message: InfoWebviewMessage): void {
  api.postMessage(message);
}
