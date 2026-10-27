import { GrpcRunOutcome } from '../core/collectionRunner';
import { PreparedGrpcCall, grpcStatusName } from '../core/grpcPreparation';
import { GrpcCallStatus } from '../shared/types';
import { GrpcConnection, GrpcTlsOptions, connectGrpc } from './grpcClient';
import { StreamHandlers } from './streamConnections';

const CANCELLED_CODE = 1;

export interface GrpcRunLimits {
  maxMessages: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface Collected {
  messages: string[];
  status?: GrpcCallStatus;
  capped: boolean;
  timedOut: boolean;
  failure?: string;
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendSingleMessage(connection: GrpcConnection, prepared: PreparedGrpcCall): void {
  const message = prepared.message.trim() === '' ? '{}' : prepared.message;
  if (connection.send(message)) {
    connection.end();
  }
}

function collectingHandlers(collected: Collected, maxMessages: number, connection: () => GrpcConnection | undefined, onClosed: () => void): StreamHandlers {
  return {
    onOpen: () => undefined,
    onSseEvent: () => undefined,
    onGrpcSent: () => undefined,
    onWebSocketMessage: (text) => {
      if (collected.capped) {
        return;
      }
      collected.messages.push(text);
      collected.capped = collected.messages.length >= maxMessages;
      if (collected.capped) {
        connection()?.close();
      }
    },
    onGrpcStatus: (status) => {
      collected.status = status;
    },
    onClosed,
  };
}

function errorFor(collected: Collected, timeoutMs: number): { error?: string } {
  const error = collected.failure ?? (collected.timedOut ? `Timed out after ${timeoutMs} ms` : undefined);
  return error ? { error } : {};
}

function toOutcome(collected: Collected, startedAt: number, timeoutMs: number): GrpcRunOutcome {
  const { status } = collected;
  return {
    statusCode: status?.code ?? CANCELLED_CODE,
    statusName: status?.codeName ?? grpcStatusName(CANCELLED_CODE),
    details: status?.details ?? '',
    timeMs: Date.now() - startedAt,
    messages: collected.messages,
    messagesCapped: collected.capped,
    ...errorFor(collected, timeoutMs),
  };
}

export async function runGrpcCall(prepared: PreparedGrpcCall, tls: GrpcTlsOptions, limits: GrpcRunLimits): Promise<GrpcRunOutcome> {
  const startedAt = Date.now();
  const collected: Collected = { messages: [], capped: false, timedOut: false };
  let connection: GrpcConnection | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    const closed = new Promise<void>((resolve) => {
      void connectGrpc(prepared, tls, collectingHandlers(collected, limits.maxMessages, () => connection, resolve))
        .then((opened) => {
          connection = opened;
          timer = setTimeout(() => {
            collected.timedOut = true;
            opened.close();
          }, limits.timeoutMs);
          limits.signal?.addEventListener('abort', () => opened.close(), { once: true });
          sendSingleMessage(opened, prepared);
        })
        .catch((error: unknown) => {
          connection?.close();
          collected.failure = describeFailure(error);
          resolve();
        });
    });
    await closed;
  } finally {
    clearTimeout(timer);
  }
  return toOutcome(collected, startedAt, limits.timeoutMs);
}
