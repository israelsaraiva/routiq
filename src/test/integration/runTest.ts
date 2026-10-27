import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const INSTALLED_VSCODE_EXECUTABLE = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';

function resolveVsCodeExecutable(): string | undefined {
  if (process.env.ROUTIQ_VSCODE_EXECUTABLE) {
    return process.env.ROUTIQ_VSCODE_EXECUTABLE;
  }
  return process.env.ROUTIQ_USE_INSTALLED_VSCODE && existsSync(INSTALLED_VSCODE_EXECUTABLE) ? INSTALLED_VSCODE_EXECUTABLE : undefined;
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = resolve(__dirname, '..');
  const scratch = join(extensionDevelopmentPath, '.test-scratch', 'integration');
  const workspace = join(scratch, 'workspace');
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });

  const vscodeExecutablePath = resolveVsCodeExecutable();
  await runTests({
    ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
    extensionDevelopmentPath,
    extensionTestsPath: join(__dirname, 'suite', 'index.js'),
    extensionTestsEnv: { ROUTIQ_TEST_SCRATCH: scratch },
    launchArgs: [workspace, '--disable-workspace-trust', '--user-data-dir', join(scratch, 'user-data'), '--extensions-dir', join(scratch, 'extensions')],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
