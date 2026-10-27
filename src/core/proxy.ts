export interface ProxySources {
  routiqProxy: string;
  vscodeProxy: string;
  env: Record<string, string | undefined>;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find((value) => value);
}

function envValue(env: ProxySources['env'], lowerName: string): string | undefined {
  return env[lowerName] ?? env[lowerName.toUpperCase()];
}

function bypassPatterns(env: ProxySources['env']): string[] {
  return (envValue(env, 'no_proxy') ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
}

function matchesBypass(host: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  const suffix = pattern.replace(/^\*?\./, '');
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isProxyBypassed(targetUrl: string, env: ProxySources['env']): boolean {
  const host = new URL(targetUrl).hostname.toLowerCase();
  return bypassPatterns(env).some((pattern) => matchesBypass(host, pattern));
}

export function resolveProxyUrl(targetUrl: string, sources: ProxySources): string | undefined {
  const isHttps = ['https:', 'wss:'].includes(new URL(targetUrl).protocol);
  const proxy = firstNonEmpty([
    sources.routiqProxy,
    sources.vscodeProxy,
    isHttps ? envValue(sources.env, 'https_proxy') : undefined,
    envValue(sources.env, 'http_proxy'),
    envValue(sources.env, 'all_proxy'),
  ]);
  if (!proxy || isProxyBypassed(targetUrl, sources.env)) {
    return undefined;
  }
  return /^[a-z]+:\/\//i.test(proxy) ? proxy : `http://${proxy}`;
}
