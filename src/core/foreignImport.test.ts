import { describe, expect, it } from 'vitest';
import { convertForeignFormat } from './foreignImport';
import { detectImportFormat } from './importDetection';

describe('convertForeignFormat', () => {
  it('converts OpenAPI YAML detections into a collection', () => {
    const detection = detectImportFormat('openapi: 3.0.0\ninfo:\n  title: Y\npaths:\n  /a:\n    get: {}\n');
    expect(convertForeignFormat(detection)?.map((collection) => collection.name)).toEqual(['Y']);
  });

  it('converts Insomnia detections', () => {
    const detection = detectImportFormat(JSON.stringify({ _type: 'export', resources: [{ _id: 'w', _type: 'workspace', name: 'W' }] }));
    expect(convertForeignFormat(detection)?.map((collection) => collection.name)).toEqual(['W']);
  });

  it('leaves other formats to the existing importers', () => {
    expect(convertForeignFormat(detectImportFormat('curl https://a.test'))).toBeUndefined();
  });
});
