import { useEffect, useState } from 'react';
import { CurlParseError } from '../core/curl';
import { extractPastedCurlCommand, importPastedCurl } from '../core/curlPaste';
import { RequestModel } from '../shared/types';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Button } from './components/ui/button';

const NOTICE_DURATION_MS = 6000;
const NOTICE_WITH_WARNINGS_DURATION_MS = 12000;

export interface CurlImportNoticeState {
  warnings: string[];
  previous: RequestModel;
}

interface CurlPasteControls {
  notice?: CurlImportNoticeState;
  handlePaste: (clipboardText: string) => boolean;
  undo: () => void;
  dismiss: () => void;
}

function noticeDurationMs(notice: CurlImportNoticeState): number {
  return notice.warnings.length > 0 ? NOTICE_WITH_WARNINGS_DURATION_MS : NOTICE_DURATION_MS;
}

export function useCurlPaste(request: RequestModel | undefined, applyRequest: (request: RequestModel) => void): CurlPasteControls {
  const [notice, setNotice] = useState<CurlImportNoticeState>();

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(() => setNotice(undefined), noticeDurationMs(notice));
    return () => clearTimeout(timer);
  }, [notice]);

  const handlePaste = (clipboardText: string): boolean => {
    const command = extractPastedCurlCommand(clipboardText);
    if (!request || command === undefined) {
      return false;
    }
    try {
      const outcome = importPastedCurl(request, command);
      applyRequest(outcome.request);
      setNotice({ warnings: outcome.warnings, previous: request });
    } catch (error) {
      if (!(error instanceof CurlParseError)) {
        throw error;
      }
      return false;
    }
    return true;
  };

  const undo = () => {
    if (notice) {
      applyRequest(notice.previous);
      setNotice(undefined);
    }
  };

  return { notice, handlePaste, undo, dismiss: () => setNotice(undefined) };
}

export function CurlImportNotice({ notice, onUndo, onDismiss }: { notice: CurlImportNoticeState; onUndo: () => void; onDismiss: () => void }) {
  return (
    <Alert variant="success" className="curl-import-notice">
      <div className="ui-alert-body">
        <AlertTitle>Imported cURL</AlertTitle>
        {notice.warnings.map((warning) => (
          <AlertDescription key={warning}>{warning}</AlertDescription>
        ))}
      </div>
      <Button variant="secondary" onClick={onUndo}>Undo</Button>
      <Button variant="ghost" aria-label="Dismiss" onClick={onDismiss}>×</Button>
    </Alert>
  );
}
