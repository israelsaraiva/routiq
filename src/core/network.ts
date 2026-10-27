export interface NetworkSettings {
  followRedirects: boolean;
  maxRedirects: number;
  proxyUrl?: string;
  rejectUnauthorized: boolean;
  useVsCodeNetworking?: boolean;
  connectTimeoutMs?: number;
}

export const DEFAULT_MAX_REDIRECTS = 10;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
export const ADDRESS_FALLBACK_TIMEOUT_MS = 250;

export function effectiveConnectTimeoutMs(network: NetworkSettings): number {
  const value = network.connectTimeoutMs;
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_CONNECT_TIMEOUT_MS;
}

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
