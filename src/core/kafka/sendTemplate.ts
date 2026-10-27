import { DynamicSources, substituteVariables, systemDynamicSources } from '../variables';

export interface MessageTemplate {
  key: string | null;
  value: string;
  headers: Record<string, string>;
}

export interface ResolvedMessage {
  key: string | null;
  value: string;
  headers: Record<string, string>;
}

export const SEQUENCE_VARIABLE = '$index';

function resolveHeaders(headers: Record<string, string>, substitute: (text: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [substitute(name), substitute(value)]));
}

export function resolveMessageTemplate(
  template: MessageTemplate,
  variables: Record<string, string>,
  sequence: number,
  sources: DynamicSources = systemDynamicSources,
): ResolvedMessage {
  const values = { [SEQUENCE_VARIABLE]: String(sequence), ...variables };
  const substitute = (text: string) => substituteVariables(text, values, sources);
  return {
    key: template.key === null ? null : substitute(template.key),
    value: substitute(template.value),
    headers: resolveHeaders(template.headers, substitute),
  };
}

export function usesPerMessageVariables(template: MessageTemplate): boolean {
  const texts = [template.key ?? '', template.value, ...Object.entries(template.headers).flat()];
  return texts.some((text) => /\{\{\s*\$[^{}\s]+\s*\}\}/.test(text));
}
