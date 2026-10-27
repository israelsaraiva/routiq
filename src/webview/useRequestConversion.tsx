import { useEffect, useState } from 'react';
import { ConversionTarget, canUndoConversion, conversionTargetLabel, convertRequest } from '../core/requestConversion';
import { RequestModel } from '../shared/types';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Button } from './components/ui/button';

const NOTICE_DURATION_MS = 12000;

export interface ConversionNoticeState {
  target: ConversionTarget;
  warnings: string[];
  previous: RequestModel;
  converted: RequestModel;
}

interface RequestConversionControls {
  notice?: ConversionNoticeState;
  convert: (target: ConversionTarget) => void;
  undo: () => void;
  canUndo: boolean;
  dismiss: () => void;
}

const UNDONE_TARGET: Record<ConversionTarget, ConversionTarget> = { graphql: 'http', http: 'graphql' };

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
    const outcome = convertRequest(request, target);
    applyRequest(outcome.request);
    onConverted(target);
    setNotice({ target, warnings: outcome.warnings, previous: request, converted: outcome.request });
  };

  const canUndo = notice !== undefined && request !== undefined && canUndoConversion(notice.converted, request);

  const undo = () => {
    if (!notice || !canUndo) {
      return;
    }
    applyRequest(notice.previous);
    onConverted(UNDONE_TARGET[notice.target]);
    setNotice(undefined);
  };

  return { notice, convert, undo, canUndo, dismiss: () => setNotice(undefined) };
}

interface ConversionNoticeProps {
  notice: ConversionNoticeState;
  canUndo: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export function ConversionNotice({ notice, canUndo, onUndo, onDismiss }: ConversionNoticeProps) {
  return (
    <Alert className="curl-import-notice">
      <div className="ui-alert-body">
        <AlertTitle>Converted to {conversionTargetLabel(notice.target)}</AlertTitle>
        {notice.warnings.map((warning) => (
          <AlertDescription key={warning}>{warning}</AlertDescription>
        ))}
      </div>
      {canUndo && (
        <Button variant="secondary" onClick={onUndo}>
          Undo
        </Button>
      )}
      <Button variant="ghost" aria-label="Dismiss" onClick={onDismiss}>×</Button>
    </Alert>
  );
}
