import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest } from './factories';
import { AutoSaveScheduler, isAutoSaveable, normalizeAutoSaveSettings } from './autoSave';

describe('AutoSaveScheduler', () => {
  const save = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    save.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function schedulerWith(delayMs = 5000, enabled = true): AutoSaveScheduler {
    const scheduler = new AutoSaveScheduler(save);
    scheduler.configure({ enabled, delayMs });
    return scheduler;
  }

  it('saves once the delay passes after an edit', () => {
    schedulerWith().touch();
    vi.advanceTimersByTime(4999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('restarts the delay on every further edit', () => {
    const scheduler = schedulerWith();
    scheduler.touch();
    vi.advanceTimersByTime(4000);
    scheduler.touch();
    vi.advanceTimersByTime(4000);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    schedulerWith(5000, false).touch();
    vi.advanceTimersByTime(60000);
    expect(save).not.toHaveBeenCalled();
  });

  it('drops a pending save when it gets disabled', () => {
    const scheduler = schedulerWith();
    scheduler.touch();
    scheduler.configure({ enabled: false, delayMs: 5000 });
    vi.advanceTimersByTime(60000);
    expect(save).not.toHaveBeenCalled();
  });

  it('cancel stops a pending save, as a manual save does', () => {
    const scheduler = schedulerWith();
    scheduler.touch();
    scheduler.cancel();
    vi.advanceTimersByTime(60000);
    expect(save).not.toHaveBeenCalled();
  });

  it('restarts a pending save with a changed delay', () => {
    const scheduler = schedulerWith();
    scheduler.touch();
    vi.advanceTimersByTime(3000);
    scheduler.configure({ enabled: true, delayMs: 1000 });
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush saves immediately only when an edit is pending', () => {
    const scheduler = schedulerWith();
    scheduler.flush();
    expect(save).not.toHaveBeenCalled();
    scheduler.touch();
    scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeAutoSaveSettings', () => {
  it('defaults, clamps and rounds', () => {
    expect(normalizeAutoSaveSettings(undefined, undefined)).toEqual({ enabled: true, delayMs: 5000 });
    expect(normalizeAutoSaveSettings(false, 100)).toEqual({ enabled: false, delayMs: 500 });
    expect(normalizeAutoSaveSettings(true, 1500.4)).toEqual({ enabled: true, delayMs: 1500 });
    expect(normalizeAutoSaveSettings(true, 'soon')).toEqual({ enabled: true, delayMs: 5000 });
  });
});

describe('isAutoSaveable', () => {
  it('refuses a blank request', () => {
    expect(isAutoSaveable(createRequest('New'))).toBe(false);
  });

  it('accepts a request with a url', () => {
    expect(isAutoSaveable({ ...createRequest('New'), url: 'https://example.com' })).toBe(true);
  });

  it('refuses a request whose JSON body is invalid', () => {
    const request = createRequest('New');
    expect(isAutoSaveable({ ...request, url: 'https://x', body: { ...request.body, type: 'json', text: '{"a":' } })).toBe(false);
    expect(isAutoSaveable({ ...request, url: 'https://x', body: { ...request.body, type: 'json', text: '{"a":1}' } })).toBe(true);
  });
});
