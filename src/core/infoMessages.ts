export interface InfoLink {
  label: string;
  url: string;
}

export interface AboutInfo {
  name: string;
  displayName: string;
  version: string;
  publisher: string;
  authorName: string;
  authorEmail: string;
  license: string;
  description: string;
  vscodeVersion: string;
  nodeVersion: string;
  electronVersion: string;
  storageDirectory: string;
  revealLabel: string;
  collectionCount: number;
  requestCount: number;
}

export type InfoHostMessage = { type: 'infoLoad'; about: AboutInfo; links: InfoLink[] };

export type InfoWebviewMessage =
  | { type: 'ready' }
  | { type: 'openSettings' }
  | { type: 'openReadme' }
  | { type: 'openLink'; url: string }
  | { type: 'contactAuthor' }
  | { type: 'revealStorage' }
  | { type: 'copyStoragePath' }
  | { type: 'copyDiagnostics' };

export type InfoView = 'help' | 'about';
