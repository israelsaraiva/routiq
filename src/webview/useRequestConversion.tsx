import { useEffect, useState } from 'react';
import { ConversionTarget, convertToGraphql, convertToHttp } from '../core/requestConversion';
import { RequestModel } from '../shared/types';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Button } from './components/ui/button';

const NOTICE_DURATION_MS = 12000;

export interface ConversionNoticeState {
  target: ConversionTarget;
  warnings: string[];
}

interface RequestConversionControls {
  notice?: ConversionNoticeState;
  convert: (target: ConversionTarget) => void;
  dismiss: () => void;
}

const TARGET_LABELS: Record<ConversionTarget, string> = { graphql: 'GraphQL', http: 'HTTP' };

export function useRequestConversion(
  request: RequestModel | undefined,
  applyRequest: (request: RequestModel) => void,
  onConverted: (target: ConversionTarget) => void,
): RequestConversionControls {
  const [notice, setNotice] = useState<ConversionNoticeState>();

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(() => setNotice(undefined), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const convert = (target: ConversionTarget) => {
    if (!request) {
      return;
    }
    const outcome = target === 'graphql' ? convertToGraphql(request) : convertToHttp(request);
    applyRequest(outcome.request);
    onConverted(target);
    setNotice(outcome.warnings.length > 0 ? { target, warnings: outcome.warnings } : undefined);
  };

  return { notice, convert, dismiss: () => setNotice(undefined) };
}

export function ConversionNotice({ notice, onDismiss }: { notice: ConversionNoticeState; onDismiss: () => void }) {
  return (
    <Alert className="curl-import-notice">
      <div className="ui-alert-body">
        <AlertTitle>Converted to {TARGET_LABELS[notice.target]}</AlertTitle>
        {notice.warnings.map((warning) => (
          <AlertDescription key={warning}>{warning}</AlertDescription>
        ))}
      </div>
      <Button variant="ghost" aria-label="Dismiss" onClick={onDismiss}>×</Button>
    </Alert>
  );
}
