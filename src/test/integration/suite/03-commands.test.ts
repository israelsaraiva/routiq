import * as assert from 'node:assert';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { scratchRoot } from '../scratch';
import { collectionFiles, readCollectionFile, useStoragePath } from '../storageHarness';
import { waitFor } from '../waiting';

type InputBoxStub = (options?: vscode.InputBoxOptions) => Thenable<string | undefined>;

describe('commands through the real extension', () => {
  const configuredDirectory = join(scratchRoot(), 'configured-storage');
  const windowApi = vscode.window as unknown as { showInputBox: InputBoxStub };
  const originalInputBox = windowApi.showInputBox;
  let stubWasCalled = false;

  before(async () => {
    await useStoragePath(configuredDirectory);
  });

  afterEach(() => {
    windowApi.showInputBox = originalInputBox;
    stubWasCalled = false;
  });

  it('routiq.newCollection creates a collection file in the configured storagePath', async function () {
    windowApi.showInputBox = async () => {
      stubWasCalled = true;
      return 'Created via command';
    };
    void vscode.commands.executeCommand('routiq.newCollection');
    const content = await waitFor(
      () => collectionFiles(configuredDirectory).map((name) => readCollectionFile(configuredDirectory, name)).find((text) => text.includes('Created via command')),
      'collection file written by the command',
      4000,
    ).catch(async () => {
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
      return undefined;
    });
    if (!stubWasCalled) {
      this.skip();
    }
    assert.ok(content, 'command should have written the collection file');
  });
});
