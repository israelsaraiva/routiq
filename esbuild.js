const esbuild = require('esbuild');

const watching = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['src/extension/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  minify: !watching,
};

const webviewConfig = {
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
  minify: !watching,
  jsx: 'automatic',
  alias: { crypto: './src/webview/browserCrypto.ts', 'node:crypto': './src/webview/browserCrypto.ts' },
  loader: { '.woff2': 'file' },
  assetNames: '[name]',
  define: { 'process.env.NODE_ENV': watching ? '"development"' : '"production"' },
};

async function run() {
  const configs = [extensionConfig, webviewConfig];
  if (watching) {
    const contexts = await Promise.all(configs.map((config) => esbuild.context(config)));
    await Promise.all(contexts.map((context) => context.watch()));
    return;
  }
  await Promise.all(configs.map((config) => esbuild.build(config)));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
