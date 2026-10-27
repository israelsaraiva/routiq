import { TopicSeek } from './startPosition';

export class ResumePoints {
  private readonly nextOffsets = new Map<string, TopicSeek>();

  get isEmpty(): boolean {
    return this.nextOffsets.size === 0;
  }

  record(topic: string, partition: number, offset: string): void {
    this.nextOffsets.set(`${topic}:${partition}`, { topic, partition, offset: (BigInt(offset) + 1n).toString() });
  }

  toSeeks(): TopicSeek[] {
    return [...this.nextOffsets.values()];
  }
}
