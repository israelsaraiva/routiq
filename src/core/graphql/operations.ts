import { GraphqlToken, significantTokens, tokenizeGraphql } from './tokens';

export type OperationType = 'query' | 'mutation' | 'subscription';

export interface GraphqlOperation {
  type: OperationType;
  name?: string;
}

const OPERATION_TYPES: string[] = ['query', 'mutation', 'subscription'];

function isOperationType(token: GraphqlToken): boolean {
  return token.kind === 'keyword' && OPERATION_TYPES.includes(token.text);
}

function nestingChange(token: GraphqlToken): number {
  if (token.kind !== 'punctuation') {
    return 0;
  }
  if (token.text === '{' || token.text === '(' || token.text === '[') {
    return 1;
  }
  return token.text === '}' || token.text === ')' || token.text === ']' ? -1 : 0;
}

function operationHeader(tokens: GraphqlToken[], index: number): GraphqlOperation {
  const token = tokens[index];
  const next = tokens[index + 1];
  const name = next?.kind === 'name' ? next.text : undefined;
  return { type: token.text as OperationType, ...(name ? { name } : {}) };
}

function startsHeader(token: GraphqlToken): boolean {
  return isOperationType(token) || (token.kind === 'keyword' && token.text === 'fragment');
}

export function listOperations(document: string): GraphqlOperation[] {
  const tokens = significantTokens(tokenizeGraphql(document));
  const operations: GraphqlOperation[] = [];
  let depth = 0;
  let insideHeader = false;
  tokens.forEach((token, index) => {
    if (depth === 0 && startsHeader(token)) {
      insideHeader = true;
      if (isOperationType(token)) {
        operations.push(operationHeader(tokens, index));
      }
    } else if (depth === 0 && token.text === '{') {
      if (!insideHeader) {
        operations.push({ type: 'query' });
      }
      insideHeader = false;
    }
    depth = Math.max(0, depth + nestingChange(token));
  });
  return operations;
}

export function namedOperations(document: string): string[] {
  return listOperations(document).flatMap((operation) => (operation.name ? [operation.name] : []));
}

export function needsOperationName(document: string): boolean {
  return listOperations(document).length > 1;
}

export function resolveOperationName(document: string, selected: string | undefined): string | undefined {
  const names = namedOperations(document);
  if (selected && names.includes(selected)) {
    return selected;
  }
  return needsOperationName(document) ? names[0] : undefined;
}
