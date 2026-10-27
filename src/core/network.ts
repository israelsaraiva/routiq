export interface NetworkSettings {
  followRedirects: boolean;
  maxRedirects: number;
  proxyUrl?: string;
  rejectUnauthorized: boolean;
  useVsCodeNetworking?: boolean;
}

export const DEFAULT_MAX_REDIRECTS = 10;

export function normalizeMaxRedirects(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_MAX_REDIRECTS;
}

export function effectiveTimeoutMs(requestTimeoutMs: number | undefined, defaultTimeoutMs: number): number {
  return requestTimeoutMs !== undefined && Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? Math.floor(requestTimeoutMs)
    : defaultTimeoutMs;
}

export interface TimingBreakdown {
  waitMs: number;
  downloadMs: number;
  redirects: number;
}

export function describeTiming(totalMs: number, timing?: TimingBreakdown): string {
  if (!timing) {
    return `Total ${totalMs} ms`;
  }
  const redirects = timing.redirects > 0 ? `, ${timing.redirects} redirect${timing.redirects === 1 ? '' : 's'}` : '';
  return `Waiting (TTFB) ${timing.waitMs} ms, download ${timing.downloadMs} ms, total ${totalMs} ms${redirects}`;
}
