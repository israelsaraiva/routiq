import { InfoLink } from './infoMessages';

interface PackageLinkFields {
  homepage?: unknown;
  repository?: unknown;
  bugs?: unknown;
}

function urlOf(value: unknown): string | undefined {
  const candidate = typeof value === 'object' && value !== null ? (value as { url?: unknown }).url : value;
  if (typeof candidate !== 'string') {
    return undefined;
  }
  const normalized = candidate.replace(/^git\+/, '').replace(/\.git$/, '');
  return /^https:\/\//i.test(normalized) ? normalized : undefined;
}

function link(label: string, value: unknown): InfoLink[] {
  const url = urlOf(value);
  return url ? [{ label, url }] : [];
}

export function collectInfoLinks(manifest: PackageLinkFields): InfoLink[] {
  return [...link('Homepage', manifest.homepage), ...link('Source code', manifest.repository), ...link('Report an issue', manifest.bugs)];
}
