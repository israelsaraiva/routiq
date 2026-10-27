import { RequestModel } from '../shared/types';
import { validateJson } from './jsonFormat';

export interface AutoSaveSettings {
  enabled: boolean;
  delayMs: number;
}

export const MIN_AUTO_SAVE_DELAY_MS = 500;
export const DEFAULT_AUTO_SAVE_SETTINGS: AutoSaveSettings = { enabled: true, delayMs: 5000 };

export function normalizeAutoSaveSettings(enabled: unknown, delayMs: unknown): AutoSaveSettings {
  const delay = typeof delayMs === 'number' && Number.isFinite(delayMs) ? delayMs : DEFAULT_AUTO_SAVE_SETTINGS.delayMs;
  return {
    enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_AUTO_SAVE_SETTINGS.enabled,
    delayMs: Math.max(MIN_AUTO_SAVE_DELAY_MS, Math.round(delay)),
  };
}

function hasContent(request: RequestModel): boolean {
  const filledRows = [...request.params, ...request.headers].some((row) => row.key.trim() !== '' || row.value.trim() !== '');
  return request.url.trim() !== '' || request.body.text.trim() !== '' || filledRows;
}

function hasValidJsonBody(request: RequestModel): boolean {
  return request.body.type !== 'json' || validateJson(request.body.text).valid;
}

export function isAutoSaveable(request: RequestModel): boolean {
  return hasContent(request) && hasValidJsonBody(request);
}

export class AutoSaveScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settings = DEFAULT_AUTO_SAVE_SETTINGS;

  constructor(private readonly save: () => void) {}

  configure(settings: AutoSaveSettings): void {
    const wasPending = this.timer !== undefined;
    this.settings = settings;
    this.cancel();
    if (wasPending && settings.enabled) {
      this.schedule();
    }
  }

  touch(): void {
    this.cancel();
    if (this.settings.enabled) {
      this.schedule();
    }
  }

  cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  flush(): void {
    if (this.timer !== undefined) {
      this.cancel();
      this.save();
    }
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.save();
    }, this.settings.delayMs);
  }
}
