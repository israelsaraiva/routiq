import { Download01Icon, StopIcon } from '@hugeicons/core-free-icons';
import { useEffect, useReducer } from 'react';
import { RequestRunResult } from '../core/collectionRunner';
import { RunnerHostMessage } from '../core/runnerMessages';
import { Icon } from './Icon';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { ScriptResults } from './ScriptResults';
import { INITIAL_RUNNER_STATE, describeProgress, describeSummary, isRunning, reduceRunner, resultBadge } from './runnerState';
import { postRunnerMessage } from './vscodeApi';

function GrpcMessages({ result }: { result: RequestRunResult }) {
  if (!result.messages || result.messages.length === 0) {
    return null;
  }
  return (
    <div className="runner-messages">
      {result.messages.map((text, index) => (
        <pre key={index} className="runner-message">{text}</pre>
      ))}
      {result.messagesCapped && <span className="runner-note">Stopped after {result.messages.length} messages.</span>}
    </div>
  );
}

function ResultRow({ result }: { result: RequestRunResult }) {
  const badge = resultBadge(result);
  return (
    <Card className="runner-row" data-outcome={result.mode === 'skipped' ? 'skipped' : result.passed ? 'passed' : 'failed'}>
      <CardContent className="runner-row-content">
        <div className="runner-head">
          <span className="method-pill" data-method={result.method}>{result.method}</span>
          <span className="runner-name">{result.name}</span>
          {result.path && <span className="runner-path">{result.path}</span>}
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {result.mode !== 'skipped' && <span className="runner-time">{result.timeMs} ms</span>}
        </div>
        {result.error && <div className="script-line script-error">{result.error}</div>}
        <ScriptResults scripts={{ tests: result.tests, errors: result.scriptErrors, console: result.console }} />
        <GrpcMessages result={result} />
      </CardContent>
    </Card>
  );
}

export function RunnerView() {
  const [state, dispatch] = useReducer(reduceRunner, INITIAL_RUNNER_STATE);
  const running = isRunning(state);

  useEffect(() => {
    const onMessage = (event: MessageEvent<RunnerHostMessage>) => dispatch(event.data);
    window.addEventListener('message', onMessage);
    postRunnerMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="app runner">
      <h2 className="runner-title">{state.title}</h2>
      <div className="runner-toolbar">
        <Button variant="secondary" disabled={!running} onClick={() => postRunnerMessage({ type: 'stop' })}>
          <Icon icon={StopIcon} />
          Stop
        </Button>
        <Button variant="secondary" disabled={state.summary === undefined} onClick={() => postRunnerMessage({ type: 'export' })}>
          <Icon icon={Download01Icon} />
          Export JSON
        </Button>
        {!state.summary && <span className="runner-progress">{describeProgress(state)}</span>}
      </div>
      {state.summary && (
        <div className="runner-summary">
          {describeSummary(state.summary).map((part) => (
            <Badge key={part} variant={part.endsWith('failed') && state.summary!.failed > 0 ? 'destructive' : 'secondary'}>{part}</Badge>
          ))}
        </div>
      )}
      <div className="runner-rows">
        {state.results.map((result, index) => (
          <ResultRow key={`${result.requestId}-${index}`} result={result} />
        ))}
      </div>
    </div>
  );
}
