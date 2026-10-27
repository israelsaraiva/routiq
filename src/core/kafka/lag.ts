import { RawCommittedOffset, RawPartitionOffsets, buildGroupOffsets } from './admin';

export function totalLag(committed: RawCommittedOffset[], watermarks: Map<string, RawPartitionOffsets[]>): number {
  return buildGroupOffsets(committed, watermarks).reduce((total, offset) => total + offset.lag, 0);
}

export function formatLag(lag: number): string {
  return lag >= 1_000_000 ? `${(lag / 1_000_000).toFixed(1)}M` : lag >= 10_000 ? `${Math.round(lag / 1000)}k` : String(lag);
}
