export function createRateLimiter(intervalMs: number, now: () => number = Date.now): (key: string) => boolean {
  const lastAllowed = new Map<string, number>();
  return (key) => {
    const current = now();
    const previous = lastAllowed.get(key);
    if (previous !== undefined && current - previous < intervalMs) {
      return false;
    }
    lastAllowed.set(key, current);
    return true;
  };
}
