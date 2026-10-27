import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { waitFor } from '../waiting';

function openWebviewViewTypes(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => tab.input)
    .filter((input): input is vscode.TabInputWebview => input instanceof vscode.TabInputWebview)
    .map((input) => input.viewType);
}

function countPanels(viewTypeSuffix: string): number {
  return openWebviewViewTypes().filter((viewType) => viewType.endsWith(viewTypeSuffix)).length;
}

describe('help and about pages', () => {
  it('registers both commands', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    assert.ok(registered.has('routiq.openHelp'));
    assert.ok(registered.has('routiq.openAbout'));
  });

  for (const view of ['help', 'about']) {
    it(`routiq.${view === 'help' ? 'openHelp' : 'openAbout'} opens a single reused panel`, async () => {
      const command = view === 'help' ? 'routiq.openHelp' : 'routiq.openAbout';
      await vscode.commands.executeCommand(command);
      await waitFor(() => countPanels(`routiq.${view}`) === 1, `${view} panel to open`);
      await vscode.commands.executeCommand(command);
      assert.strictEqual(countPanels(`routiq.${view}`), 1);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
  }
});
