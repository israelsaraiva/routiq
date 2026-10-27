import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { createKafkaProfile } from '../../../core/kafka/profiles';
import { RoutiqExtensionApi } from '../../../extension/extension';
import { EXTENSION_ID } from '../extensionInfo';
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

describe('kafka connections in the sidebar', () => {
  it('lists a connection after connecting without pressing save', async () => {
    const api = (await vscode.extensions.getExtension(EXTENSION_ID)?.activate()) as RoutiqExtensionApi;
    const profile = { ...createKafkaProfile('Sidebar Probe'), brokers: '127.0.0.1:1', topics: 'probe' };
    assert.strictEqual(api.kafkaTree.getChildren().some((item) => item.profile.id === profile.id), false);

    await vscode.commands.executeCommand('routiq.openKafka');
    await waitFor(() => countKafkaPanels() === 1, 'kafka panel to open');
    const [panel] = [...(api.kafkaPanels as unknown as { panels: Set<{ handleMessage(message: unknown): Promise<void> }> }).panels];
    await panel.handleMessage({ type: 'kafkaConnect', profile });

    await waitFor(() => api.kafkaTree.getChildren().some((item) => item.profile.id === profile.id) || undefined, 'connection in sidebar');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await api.kafkaProfiles.remove(profile.id);
  });
});
