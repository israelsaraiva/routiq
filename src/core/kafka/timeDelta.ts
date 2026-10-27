const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

export function formatTimeDelta(deltaMs: number): string {
  const elapsed = Math.abs(deltaMs);
  if (elapsed < MS_PER_SECOND) {
    return `+${Math.round(elapsed)}ms`;
  }
  if (elapsed < MS_PER_MINUTE) {
    return `+${(elapsed / MS_PER_SECOND).toFixed(1)}s`;
  }
  return `+${Math.floor(elapsed / MS_PER_MINUTE)}m ${Math.round((elapsed % MS_PER_MINUTE) / MS_PER_SECOND)}s`;
}
