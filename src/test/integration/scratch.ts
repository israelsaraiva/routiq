import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

const SCRATCH_ROOT_VARIABLE = 'ROUTIQ_TEST_SCRATCH';

export function scratchRoot(): string {
  const root = process.env[SCRATCH_ROOT_VARIABLE];
  if (!root) {
    throw new Error(`${SCRATCH_ROOT_VARIABLE} is not set`);
  }
  return root;
}

export function createScratchDirectory(prefix: string): string {
  const parent = join(scratchRoot(), 'work');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, `${prefix}-`));
}
