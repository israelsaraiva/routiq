import type { AwsCredentials } from './sigv4';

export function awsCredentialsFromEnvironment(environment: NodeJS.ProcessEnv): AwsCredentials | undefined {
  const accessKeyId = environment.AWS_ACCESS_KEY_ID;
  const secretAccessKey = environment.AWS_SECRET_ACCESS_KEY;
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, sessionToken: environment.AWS_SESSION_TOKEN || undefined } : undefined;
}

export function regionFromEnvironment(environment: NodeJS.ProcessEnv): string | undefined {
  return environment.AWS_REGION || environment.AWS_DEFAULT_REGION || undefined;
}
