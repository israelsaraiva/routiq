import * as vscode from 'vscode';
import { Cookie } from '../core/cookies';
import { describeCookie } from '../core/cookieLabels';
import { TreeNode } from './collectionsTree';
import { pickCollectionId } from './destinationPicker';
import { CookieStore } from './cookieStore';
import { Storage } from './storage';

interface CookieChoice extends vscode.QuickPickItem {
  cookie: Cookie;
}

function toChoice(cookie: Cookie): CookieChoice {
  const label = describeCookie(cookie);
  return { label: label.title, description: label.detail, cookie };
}

async function chooseCookiesToDelete(cookies: Cookie[]): Promise<Cookie[]> {
  const picked = await vscode.window.showQuickPick(cookies.map(toChoice), {
    canPickMany: true,
    placeHolder: 'Select cookies to delete (Esc to cancel)',
  });
  return picked?.map((choice) => choice.cookie) ?? [];
}

export async function manageCookies(storage: Storage, cookieStore: CookieStore, node?: TreeNode): Promise<void> {
  const collectionId = await pickCollectionId(storage, node);
  if (!collectionId) {
    return;
  }
  const cookies = await cookieStore.list(collectionId);
  if (cookies.length === 0) {
    vscode.window.showInformationMessage('This collection has no stored cookies.');
    return;
  }
  const clearAll = 'Clear all cookies';
  const action = await vscode.window.showQuickPick(['Select cookies to delete', clearAll], { placeHolder: `${cookies.length} stored cookie(s)` });
  if (action === clearAll) {
    await cookieStore.clear(collectionId);
    return;
  }
  if (action) {
    await cookieStore.remove(collectionId, await chooseCookiesToDelete(cookies));
  }
}
