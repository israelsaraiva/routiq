import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { waitFor } from '../waiting';

function countKafkaPanels(): number {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('routiq.kafka')).length;
}

describe('kafka listener', () => {
  it('registers its commands', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    for (const command of ['routiq.openKafka', 'routiq.newKafkaConnection', 'routiq.openKafkaConnection', 'routiq.deleteKafkaConnection']) {
      assert.ok(registered.has(command), command);
    }
  });

  it('opens a listener panel and closes it cleanly', async () => {
    await vscode.commands.executeCommand('routiq.openKafka');
    await waitFor(() => countKafkaPanels() === 1, 'kafka panel to open');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await waitFor(() => countKafkaPanels() === 0, 'kafka panel to close');
  });
});
