import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { RoutiqExtensionApi } from '../../../extension/extension';
import { EXTENSION_ID } from '../extensionInfo';
import { waitFor } from '../waiting';

describe('tree auto reveal', () => {
  let api: RoutiqExtensionApi;

  before(async () => {
    api = (await vscode.extensions.getExtension(EXTENSION_ID)?.activate()) as RoutiqExtensionApi;
    await vscode.commands.executeCommand('routiq.collections.focus');
    await waitFor(() => api.treeView.visible || undefined, 'tree view to become visible');
  });

  afterEach(async () => {
    await vscode.workspace.getConfiguration('routiq').update('autoReveal', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  const selectedRequestId = () => {
    const selected = api.treeView.selection[0] as { request?: { id: string } } | undefined;
    return selected?.request?.id;
  };

  function addNestedRequest(name: string) {
    const collection = api.storage.addCollection(`Reveal ${name}`);
    const outer = api.storage.addFolder(collection.id, 'Outer')!;
    const inner = api.storage.addFolder(collection.id, 'Inner', outer.id)!;
    return api.storage.addRequest(collection.id, name, inner.id)!;
  }

  it('selects the request of a newly opened panel inside nested folders', async () => {
    const request = addNestedRequest('Nested');
    api.panels.open(request.id);
    await waitFor(() => selectedRequestId() === request.id || undefined, 'tree selection on the opened request');
  });

  it('selects the request again when its panel is reopened after another was opened', async () => {
    const first = addNestedRequest('First');
    const second = addNestedRequest('Second');
    api.panels.open(first.id);
    await waitFor(() => selectedRequestId() === first.id || undefined, 'first request selected');
    api.panels.open(second.id);
    await waitFor(() => selectedRequestId() === second.id || undefined, 'second request selected');
    api.panels.open(first.id);
    await waitFor(() => selectedRequestId() === first.id || undefined, 'first request selected again');
  });

  it('does not change the selection when routiq.autoReveal is off', async () => {
    await vscode.workspace.getConfiguration('routiq').update('autoReveal', false, vscode.ConfigurationTarget.Global);
    const request = addNestedRequest('Disabled');
    api.panels.open(request.id);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.notStrictEqual(selectedRequestId(), request.id);
  });

  it('declares the setting in the manifest with default true', () => {
    const property = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON.contributes.configuration.properties['routiq.autoReveal'];
    assert.strictEqual(property.default, true);
  });
});
