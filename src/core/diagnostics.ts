import { AboutInfo } from './infoMessages';

export type SettingsSnapshot = Record<string, unknown>;

const URL_CREDENTIALS_PATTERN = /(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;

export function redactCredentials(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(URL_CREDENTIALS_PATTERN, '$1***@') : value;
}

export function redactSettings(settings: SettingsSnapshot): SettingsSnapshot {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, redactCredentials(value)]));
}

export function revealLabelFor(platform: string): string {
  if (platform === 'darwin') {
    return 'Reveal in Finder';
  }
  return platform === 'win32' ? 'Reveal in Explorer' : 'Reveal in file manager';
}

export function formatDiagnostics(about: AboutInfo, platform: string, settings: SettingsSnapshot): string {
  const lines = [
    `${about.displayName} ${about.version} (${about.publisher}.${about.name})`,
    `VS Code: ${about.vscodeVersion}`,
    `Electron: ${about.electronVersion}`,
    `Node: ${about.nodeVersion}`,
    `Platform: ${platform}`,
    `Collections: ${about.collectionCount}`,
    `Requests: ${about.requestCount}`,
    'Settings:',
    ...Object.entries(redactSettings(settings)).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`),
  ];
  return lines.join('\n');
}
