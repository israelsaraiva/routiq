import { KeyValue } from '../shared/types';

function splitFragment(url: string): [string, string] {
  const index = url.indexOf('#');
  return index === -1 ? [url, ''] : [url.slice(0, index), url.slice(index)];
}

function encodePair(pair: KeyValue): string {
  return `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value)}`;
}

export function activePairs(pairs: KeyValue[]): KeyValue[] {
  return pairs.filter((pair) => pair.enabled && pair.key.trim() !== '');
}

export function buildQueryString(params: KeyValue[]): string {
  return activePairs(params).map(encodePair).join('&');
}

export function buildUrl(baseUrl: string, params: KeyValue[]): string {
  const query = buildQueryString(params);
  if (!query) {
    return baseUrl;
  }
  const [withoutFragment, fragment] = splitFragment(baseUrl);
  const separator = !withoutFragment.includes('?') ? '?' : /[?&]$/.test(withoutFragment) ? '' : '&';
  return `${withoutFragment}${separator}${query}${fragment}`;
}
