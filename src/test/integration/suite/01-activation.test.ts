import * as assert from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from '../extensionInfo';
import { scratchRoot } from '../scratch';

function declaredCommandIds(): string[] {
  const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON;
  return (manifest?.contributes?.commands ?? []).map((command: { command: string }) => command.command);
}

describe('extension activation', () => {
  it('is installed and activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, 'extension should be discoverable');
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  it('registers every command contributed in package.json', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = declaredCommandIds().filter((command) => !registered.has(command));
    assert.deepStrictEqual(missing, []);
    assert.ok(declaredCommandIds().length > 0);
  });

  it('creates the configured storage directory on activation', () => {
    assert.ok(existsSync(join(scratchRoot(), 'configured-storage')));
  });
});
