import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { KafkaConfig } from 'kafkajs';
import { buildMskIamToken } from '../core/kafka/auth/mskIamToken';
import { KafkaMskIamCredentials, KafkaOAuthBearerCredentials, KafkaOAuthTokenEndpoint, KafkaSaslConfig, KafkaTlsSources } from '../core/kafka/connection';
import { obtainToken } from './oauthTokens';

const TOKEN_TIMEOUT_MS = 10000;
const PEM_MARKER = '-----BEGIN';

export const MISSING_AWS_CREDENTIALS_MESSAGE =
  'AWS credentials not found. Set the access key and secret in the connection, or provide AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the environment.';

function expandHome(path: string): string {
  return path.startsWith('~/') ? `${homedir()}${path.slice(1)}` : path;
}

export function readPemOrFile(source: string, label: string): string {
  if (source.includes(PEM_MARKER)) {
    return source;
  }
  try {
    return readFileSync(expandHome(source.trim()), 'utf8');
  } catch (error) {
    throw new Error(`Cannot read the ${label} file "${source}": ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
  }
}

export function buildTlsOptions(tls: KafkaTlsSources): NonNullable<Exclude<KafkaConfig['ssl'], boolean>> {
  const key = tls.keyPem ?? (tls.keyPath ? readPemOrFile(tls.keyPath, 'client key') : undefined);
  return {
    rejectUnauthorized: tls.rejectUnauthorized,
    ...(tls.ca && { ca: [readPemOrFile(tls.ca, 'CA certificate')] }),
    ...(tls.cert && { cert: readPemOrFile(tls.cert, 'client certificate') }),
    ...(key && { key }),
    ...(tls.passphrase && { passphrase: tls.passphrase }),
  };
}

function oauthTokenProvider(credentials: KafkaOAuthBearerCredentials): () => Promise<{ value: string }> {
  return async () => {
    if (credentials.tokenEndpoint) {
      return { value: (await fetchEndpointToken(credentials.tokenEndpoint)).accessToken };
    }
    if (!credentials.staticToken) {
      throw new Error('OAUTHBEARER needs either a token or a token endpoint with client credentials.');
    }
    return { value: credentials.staticToken };
  };
}

function fetchEndpointToken({ tokenUrl, clientId, clientSecret, scope }: KafkaOAuthTokenEndpoint) {
  return obtainToken({ type: 'oauth2', grant: 'client_credentials', tokenUrl, clientId, clientSecret, scope, username: '', password: '' }, {}, TOKEN_TIMEOUT_MS);
}

function mskIamTokenProvider({ region, credentials }: KafkaMskIamCredentials): () => Promise<{ value: string }> {
  return async () => {
    if (!credentials) {
      throw new Error(MISSING_AWS_CREDENTIALS_MESSAGE);
    }
    if (!region) {
      throw new Error('AWS region is required for MSK IAM. Set it in the connection or via AWS_REGION.');
    }
    return { value: buildMskIamToken({ region, credentials, now: new Date() }).value };
  };
}

export function buildKafkaSasl(sasl: KafkaSaslConfig | undefined): KafkaConfig['sasl'] {
  if (!sasl) {
    return undefined;
  }
  switch (sasl.mechanism) {
    case 'oauthbearer':
      return { mechanism: 'oauthbearer', oauthBearerProvider: oauthTokenProvider(sasl) };
    case 'aws-msk-iam':
      return { mechanism: 'oauthbearer', oauthBearerProvider: mskIamTokenProvider(sasl) };
    default:
      return { mechanism: sasl.mechanism, username: sasl.username, password: sasl.password } as KafkaConfig['sasl'];
  }
}
