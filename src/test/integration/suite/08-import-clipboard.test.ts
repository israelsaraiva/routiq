import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { RoutiqExtensionApi } from '../../../extension/extension';
import { EXTENSION_ID } from '../extensionInfo';
import { waitFor } from '../waiting';

type QuickPickStub = (items: readonly vscode.QuickPickItem[]) => Thenable<vscode.QuickPickItem | undefined>;

const COUNTRIES_CURL = `curl -X POST https://countries.trevorblades.com/ -H 'Content-Type: application/json' -d '{"query":"{ country(code:\\"BE\\"){ name capital } }"}'`;
const COUNTRIES_QUERY = '{ country(code:"BE"){ name capital } }';

describe('Import from Clipboard', () => {
  const windowApi = vscode.window as unknown as { showQuickPick: QuickPickStub };
  const originalQuickPick = windowApi.showQuickPick;
  let originalClipboard = '';
  let api: RoutiqExtensionApi;

  before(async () => {
    api = (await vscode.extensions.getExtension(EXTENSION_ID)?.activate()) as RoutiqExtensionApi;
    originalClipboard = await vscode.env.clipboard.readText();
  });

  afterEach(async () => {
    windowApi.showQuickPick = originalQuickPick;
    await vscode.env.clipboard.writeText(originalClipboard);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('saves a GraphQL cURL into the chosen collection folder and opens it', async () => {
    const collection = api.storage.addCollection('Clipboard import');
    const folder = api.storage.addFolder(collection.id, 'Countries')!;
    windowApi.showQuickPick = async (items) =>
      items.find((item) => item.label === collection.name) ?? items.find((item) => item.label.includes('Countries'));
    await vscode.env.clipboard.writeText(COUNTRIES_CURL);

    await vscode.commands.executeCommand('routiq.importFromClipboard');

    const imported = await waitFor(
      () => {
        const target = api.storage.getCollection(collection.id)?.items.find((entry) => 'items' in entry && entry.id === folder.id);
        return target && 'items' in target ? target.items[0] : undefined;
      },
      'imported request inside the folder',
    );
    assert.ok('body' in imported);
    assert.strictEqual(imported.kind, 'graphql');
    assert.strictEqual(imported.body.type, 'graphql');
    assert.strictEqual(imported.body.text, COUNTRIES_QUERY);
    await waitFor(
      () => vscode.window.tabGroups.all.flatMap((group) => group.tabs).find((tab) => tab.label.includes(imported.name)),
      'panel opened for the imported request',
    );
  });
});
