import { describe, expect, it } from 'vitest';
import { createRequest } from './factories';
import { createStreamHistoryEntry, toSummary } from './history';
import { MAX_RECORDED_MESSAGES, StreamRecorder } from './streamRecording';

function receivedMessage(sequence: number, text: string) {
  return { type: 'wsMessage' as const, entry: { sequence, timestamp: sequence, direction: 'received' as const, text, sizeBytes: text.length, binary: false } };
}

describe('StreamRecorder', () => {
  it('records a grpc session with sent and received messages and its status', () => {
    const recorder = new StreamRecorder(() => 1000);
    recorder.begin('grpc');
    recorder.observe({ type: 'streamStatus', status: 'open' });
    recorder.observe({ type: 'wsMessage', entry: { sequence: 1, timestamp: 1, direction: 'sent', text: '{}', sizeBytes: 2, binary: false } });
    recorder.observe(receivedMessage(2, '{"ok":true}'));
    recorder.observe({ type: 'grpcStatus', status: { code: 0, codeName: 'OK', details: '', trailers: [] } });
    const recording = recorder.observe({ type: 'streamStatus', status: 'closed', detail: 'OK' });
    expect(recording).toMatchObject({ kind: 'grpc', failed: false, totalMessages: 2, grpcStatus: { codeName: 'OK' } });
    expect(recorder.isActive).toBe(false);
  });

  it('caps stored messages but counts all of them', () => {
    const recorder = new StreamRecorder();
    recorder.begin('websocket');
    for (let index = 0; index < MAX_RECORDED_MESSAGES + 5; index++) {
      recorder.observe(receivedMessage(index, 'x'));
    }
    const recording = recorder.abort('Disconnected')!;
    expect(recording.messages).toHaveLength(MAX_RECORDED_MESSAGES);
    expect(recording.totalMessages).toBe(MAX_RECORDED_MESSAGES + 5);
  });

  it('records sse events with their event name and marks errors as failed', () => {
    const recorder = new StreamRecorder();
    recorder.begin('sse');
    recorder.observe({ type: 'sseEvent', entry: { sequence: 1, timestamp: 1, event: { event: 'tick', data: 'hi' } } });
    const recording = recorder.observe({ type: 'streamStatus', status: 'error', detail: 'HTTP 500' })!;
    expect(recording.messages[0]).toMatchObject({ label: 'tick', text: 'hi', direction: 'received' });
    expect(recording.failed).toBe(true);
  });

  it('ignores messages outside a session', () => {
    expect(new StreamRecorder().observe(receivedMessage(1, 'x'))).toBeUndefined();
  });
});

describe('createStreamHistoryEntry', () => {
  it('describes a session entry for the history list', () => {
    const recorder = new StreamRecorder();
    recorder.begin('sse');
    recorder.observe(receivedMessage(1, 'abc'));
    const recording = recorder.observe({ type: 'streamStatus', status: 'error', detail: 'boom' })!;
    const entry = createStreamHistoryEntry({ id: 'h1', request: createRequest('r'), url: 'https://x', recording });
    expect(entry).toMatchObject({ kind: 'sse', method: 'SSE', statusText: 'Error', status: 0, error: 'boom', sizeBytes: 3 });
    expect(entry.session).toMatchObject({ totalMessages: 1, truncated: false, closeDetail: 'boom' });
    expect(toSummary(entry).kind).toBe('sse');
  });
});
