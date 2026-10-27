import { useEffect, useMemo, useRef } from 'react';
import { AutoSaveScheduler, AutoSaveSettings } from '../core/autoSave';

export function useAutoSave(settings: AutoSaveSettings, save: () => void): AutoSaveScheduler {
  const saveRef = useRef(save);
  saveRef.current = save;
  const scheduler = useMemo(() => new AutoSaveScheduler(() => saveRef.current()), []);

  useEffect(() => scheduler.configure(settings), [scheduler, settings.enabled, settings.delayMs]);

  useEffect(() => {
    const flushWhenHidden = () => document.visibilityState === 'hidden' && scheduler.flush();
    const flush = () => scheduler.flush();
    window.addEventListener('blur', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('blur', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      scheduler.cancel();
    };
  }, [scheduler]);

  return scheduler;
}
