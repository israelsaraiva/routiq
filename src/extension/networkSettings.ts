import * as vscode from 'vscode';
import { NetworkSettings, effectiveTimeoutMs, normalizeMaxRedirects } from '../core/network';
import { resolveProxyUrl } from '../core/proxy';
import { CookieSession, SendOptions } from './httpClient';

export function defaultTimeoutMs(): number {
  return vscode.workspace.getConfiguration('routiq').get<number>('timeoutMs', 30000);
}

function readNetworkSettings(targetUrl: string): NetworkSettings {
  const settings = vscode.workspace.getConfiguration('routiq');
  const vscodeProxy = vscode.workspace.getConfiguration('http').get<string>('proxy', '');
  return {
    followRedirects: settings.get<boolean>('followRedirects', true),
    maxRedirects: normalizeMaxRedirects(settings.get<number>('maxRedirects', 10)),
    proxyUrl: resolveProxyUrl(targetUrl, { routiqProxy: settings.get<string>('proxy', ''), vscodeProxy, env: process.env }),
    rejectUnauthorized: settings.get<boolean>('rejectUnauthorized', true),
  };
}

export function buildSendOptions(targetUrl: string, requestTimeoutMs: number | undefined, cookies?: CookieSession): SendOptions {
  return {
    timeoutMs: effectiveTimeoutMs(requestTimeoutMs, defaultTimeoutMs()),
    network: readNetworkSettings(targetUrl),
    cookies,
  };
}
