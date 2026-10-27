import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Mocha from 'mocha';

const TEST_TIMEOUT_MS = 30000;

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: TEST_TIMEOUT_MS });
  readdirSync(__dirname)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .forEach((name) => mocha.addFile(join(__dirname, name)));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => (failures > 0 ? reject(new Error(`${failures} integration test(s) failed`)) : resolve()));
  });
}
