import * as vscode from 'vscode';
import { CurlParseError, curlGenerationWarnings, generateCurlCommand, parseCurlCommand } from '../core/curl';
import { CurlShell, CurlShellSetting, resolveCurlShell } from '../core/curlShell';
import { resolveCollectionVariables } from '../core/environments';
import { PreparedRequest, prepareRequest } from '../core/requestBuilder';
import { RequestModel } from '../shared/types';
import { EntryDestination } from './destinationPicker';
import { cachedAuthorization } from './oauthTokens';
import { SecretVault } from './secretVault';
import { Storage } from './storage';

function prepareForCurl(request: RequestModel, variables: Record<string, string>): PreparedRequest {
  const oauthAuthorization = request.auth.type === 'oauth2' ? cachedAuthorization(request.auth, variables) : undefined;
  return prepareRequest(request, variables, { oauthAuthorization });
}

function configuredCurlShell(): CurlShell {
  const setting = vscode.workspace.getConfiguration('routiq').get<CurlShellSetting>('curlShell', 'auto');
  return resolveCurlShell(setting, process.platform);
}

export async function copyRequestAsCurl(request: RequestModel, variables: Record<string, string>): Promise<void> {
  const prepared = prepareForCurl(request, variables);
  await vscode.env.clipboard.writeText(generateCurlCommand(prepared, configuredCurlShell()));
  const warnings = curlGenerationWarnings(request.auth, prepared);
  if (warnings.length > 0) {
    vscode.window.showWarningMessage(`Routiq: copied as cURL with notes — ${warnings.join('; ')}`);
  } else {
    vscode.window.showInformationMessage('Copied as cURL.');
  }
}

export async function copyStoredRequestAsCurl(storage: Storage, vault: SecretVault, requestId: string): Promise<void> {
  const location = storage.findRequest(requestId);
  if (location) {
    await vault.load([location.collection]);
    await copyRequestAsCurl(location.request, resolveCollectionVariables(vault.hydrate(location.collection)));
  }
}

export function importCurlCommand(
  storage: Storage,
  command: string,
  destination: EntryDestination,
): RequestModel | undefined {
  try {
    const { request, warnings } = parseCurlCommand(command);
    const added = storage.addRequestFrom(destination.collectionId, request, destination.folderId);
    if (added && warnings.length > 0) {
      vscode.window.showWarningMessage(`Routiq: imported with notes — ${warnings.join('; ')}`);
    }
    return added;
  } catch (error) {
    if (error instanceof CurlParseError) {
      vscode.window.showErrorMessage(`Routiq cURL import failed: ${error.message}`);
      return undefined;
    }
    throw error;
  }
}
