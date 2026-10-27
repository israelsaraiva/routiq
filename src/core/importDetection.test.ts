import { describe, expect, it } from 'vitest';
import { detectImportFormat } from './importDetection';
import { buildExportFile } from './postman';
import { createCollection } from './factories';

describe('detectImportFormat', () => {
  it('detects cURL commands, with prompt, leading whitespace and line continuations', () => {
    expect(detectImportFormat("  curl -X POST 'https://a.test'  ")).toEqual({ kind: 'curl', command: "curl -X POST 'https://a.test'" });
    expect(detectImportFormat('$ curl https://a.test').kind).toBe('curl');
    expect(detectImportFormat('CURL https://a.test').kind).toBe('curl');
    expect(detectImportFormat('curl \\\n  https://a.test').kind).toBe('curl');
  });

  it('does not mistake words starting with curl for a command', () => {
    expect(detectImportFormat('curly braces').kind).toBe('unrecognized');
  });

  it('detects Routiq export files and single collection files', () => {
    const exported = JSON.stringify(buildExportFile([createCollection('C', () => 'c')]));
    expect(detectImportFormat(exported).kind).toBe('routiq');
    expect(detectImportFormat(JSON.stringify({ version: 2, id: 'x', name: 'N', items: [] })).kind).toBe('routiq');
    expect(detectImportFormat(JSON.stringify({ version: 1, collections: [] })).kind).toBe('routiq');
  });

  it('detects Postman collections, tolerating a BOM', () => {
    const postman = JSON.stringify({ info: { name: 'P' }, item: [] });
    expect(detectImportFormat(postman).kind).toBe('postman');
    expect(detectImportFormat(`\uFEFF${postman}`).kind).toBe('postman');
  });

  it('explains empty input', () => {
    expect(detectImportFormat('  \n ')).toEqual({ kind: 'unrecognized', reason: expect.stringContaining('empty') });
  });

  it('explains invalid JSON', () => {
    const detection = detectImportFormat('{"info": ');
    expect(detection).toMatchObject({ kind: 'unrecognized' });
    expect(detection.kind === 'unrecognized' && detection.reason).toContain('not valid JSON');
  });

  it('explains JSON of an unknown shape', () => {
    const object = detectImportFormat('{"foo": 1}');
    expect(object.kind === 'unrecognized' && object.reason).toContain('neither');
    const array = detectImportFormat('[1, 2]');
    expect(array.kind === 'unrecognized' && array.reason).toContain('JSON object');
  });

  it('lists the supported formats for arbitrary text', () => {
    const detection = detectImportFormat('hello there');
    expect(detection.kind === 'unrecognized' && detection.reason).toMatch(/cURL.*Routiq.*Postman/);
  });
});

describe('detectImportFormat – OpenAPI and Insomnia', () => {
  const openApi = { openapi: '3.0.0', info: { title: 'T' }, paths: {} };

  it('detects OpenAPI JSON and Swagger JSON', () => {
    expect(detectImportFormat(JSON.stringify(openApi)).kind).toBe('openapi');
    expect(detectImportFormat(JSON.stringify({ swagger: '2.0', paths: {} })).kind).toBe('openapi');
  });

  it('detects OpenAPI YAML', () => {
    expect(detectImportFormat('openapi: 3.0.0\ninfo:\n  title: T\npaths: {}\n').kind).toBe('openapi');
    expect(detectImportFormat('swagger: "2.0"\npaths:\n  /a: {}\n').kind).toBe('openapi');
  });

  it('detects Insomnia v4 exports', () => {
    expect(detectImportFormat(JSON.stringify({ _type: 'export', __export_format: 4, resources: [] })).kind).toBe('insomnia');
  });

  it('keeps rejecting unrelated YAML and plain text', () => {
    expect(detectImportFormat('name: x\nvalue: 1').kind).toBe('unrecognized');
    expect(detectImportFormat('just some words').kind).toBe('unrecognized');
    expect(detectImportFormat('key: [unclosed').kind).toBe('unrecognized');
  });
});
