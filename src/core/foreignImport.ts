import { Collection } from '../shared/types';
import { ImportWarnings } from './importReport';
import { ImportDetection } from './importDetection';
import { importInsomnia } from './insomnia';
import { IdGenerator, generateId } from './ids';
import { importOpenApi } from './openapi';

export function convertForeignFormat(detection: ImportDetection, newId: IdGenerator = generateId, warnings: ImportWarnings = []): Collection[] | undefined {
  if (detection.kind === 'openapi') {
    return [importOpenApi(detection.data, newId, warnings)];
  }
  if (detection.kind === 'insomnia') {
    return importInsomnia(detection.data, newId);
  }
  return undefined;
}
