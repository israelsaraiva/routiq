export function readStyleNonce(): string | undefined {
  const script = document.querySelector<HTMLScriptElement>('script[nonce]');
  return script?.nonce || undefined;
}
