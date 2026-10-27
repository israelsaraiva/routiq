import { RequestRunResult, RunSummary } from './collectionRunner';

export type RunnerHostMessage =
  | { type: 'start'; title: string; total: number; delayMs: number }
  | { type: 'result'; index: number; result: RequestRunResult }
  | { type: 'done'; summary: RunSummary };

export type RunnerWebviewMessage = { type: 'ready' } | { type: 'stop' } | { type: 'export' };
