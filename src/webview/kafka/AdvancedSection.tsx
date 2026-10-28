import { ArrowDown01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { ReactNode, useEffect } from 'react';
import { Icon } from '../Icon';
import { useStoredFlag } from './useStoredFlag';

const ADVANCED_STORAGE_KEY = 'routiq.kafka.advancedOpen';
const ADVANCED_CONTENT_ID = 'kafka-advanced';

interface Props {
  forceOpenKey: string | null;
  hasValues: boolean;
  children: ReactNode;
}

export function AdvancedSection({ forceOpenKey, hasValues, children }: Props) {
  const [open, setOpen] = useStoredFlag(ADVANCED_STORAGE_KEY, false);

  useEffect(() => {
    if (forceOpenKey) setOpen(true);
  }, [forceOpenKey, setOpen]);

  return (
    <div className="kafka-advanced">
      <button type="button" className="kafka-advanced-toggle" aria-expanded={open} aria-controls={ADVANCED_CONTENT_ID} onClick={() => setOpen(!open)}>
        <Icon icon={open ? ArrowDown01Icon : ArrowRight01Icon} size={14} />
        <span>Advanced</span>
        {hasValues && <span className="kafka-advanced-dot" role="img" aria-label="Advanced settings configured" />}
      </button>
      {open && (
        <div id={ADVANCED_CONTENT_ID} className="kafka-advanced-body">
          {children}
        </div>
      )}
    </div>
  );
}
