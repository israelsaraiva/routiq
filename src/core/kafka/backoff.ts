export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
}

export const RECONNECT_BACKOFF: BackoffPolicy = { baseMs: 1000, maxMs: 30000 };

export function backoffCeiling(attempt: number, { baseMs, maxMs }: BackoffPolicy): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 30);
  return Math.min(maxMs, baseMs * 2 ** exponent);
}

export function nextBackoffDelay(attempt: number, policy: BackoffPolicy = RECONNECT_BACKOFF, random: () => number = Math.random): number {
  const ceiling = backoffCeiling(attempt, policy);
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}
