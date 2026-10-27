const esbuild = require('esbuild');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const suiteDirectory = join(__dirname, '..', 'src', 'test', 'integration', 'suite');
const suiteEntries = readdirSync(suiteDirectory)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(suiteDirectory, name));

esbuild
  .build({
    entryPoints: [join(__dirname, '..', 'src', 'test', 'integration', 'runTest.ts'), ...suiteEntries],
    outdir: 'dist-test',
    outbase: join(__dirname, '..', 'src', 'test', 'integration'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode', 'mocha', '@vscode/test-electron'],
    sourcemap: true,
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
