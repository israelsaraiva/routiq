import * as vscode from 'vscode';
import { KafkaProfile } from '../shared/types';
import { KafkaProfileStore } from './kafkaProfileStore';

export class KafkaProfileItem extends vscode.TreeItem {
  constructor(readonly profile: KafkaProfile) {
    super(profile.name, vscode.TreeItemCollapsibleState.None);
    this.id = profile.id;
    this.description = profile.brokers;
    this.tooltip = `${profile.brokers}\n${profile.topics}`;
    this.contextValue = 'kafkaConnection';
    this.iconPath = new vscode.ThemeIcon('broadcast');
    this.command = { command: 'routiq.openKafkaConnection', title: 'Open Kafka Connection', arguments: [this] };
  }
}

export class KafkaTreeProvider implements vscode.TreeDataProvider<KafkaProfileItem> {
  readonly onDidChangeTreeData: vscode.Event<void>;

  constructor(private readonly profiles: KafkaProfileStore) {
    this.onDidChangeTreeData = profiles.onDidChange;
  }

  getTreeItem(item: KafkaProfileItem): vscode.TreeItem {
    return item;
  }

  getChildren(): KafkaProfileItem[] {
    return this.profiles.list().map((profile) => new KafkaProfileItem(profile));
  }
}
