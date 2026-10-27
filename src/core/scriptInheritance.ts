import { RequestScripts } from '../shared/types';

function joinNonEmpty(sources: string[]): string {
  return sources.filter((source) => source.trim() !== '').join('\n');
}

export function combineInheritedScripts(ancestors: Array<RequestScripts | undefined>, own: RequestScripts | undefined): RequestScripts | undefined {
  const chain = ancestors.filter((scripts): scripts is RequestScripts => scripts !== undefined);
  const pre = joinNonEmpty([...chain, ...(own ? [own] : [])].map((scripts) => scripts.pre));
  const post = joinNonEmpty([...(own ? [own] : []), ...[...chain].reverse()].map((scripts) => scripts.post));
  return pre === '' && post === '' ? undefined : { pre, post };
}
