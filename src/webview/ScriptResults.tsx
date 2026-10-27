import { ScriptsOutcome } from '../shared/types';

export function countFailedTests(scripts: ScriptsOutcome): number {
  return scripts.tests.filter((test) => !test.passed).length;
}

export function describeScriptsTab(scripts: ScriptsOutcome): string {
  const failed = countFailedTests(scripts);
  const passed = scripts.tests.length - failed;
  return `Tests (${passed}/${scripts.tests.length})`;
}

export function ScriptResults({ scripts }: { scripts: ScriptsOutcome }) {
  return (
    <div className="script-results">
      {scripts.errors.map((message, index) => (
        <div key={`error-${index}`} className="script-line script-error">
          {message}
        </div>
      ))}
      {scripts.tests.map((test, index) => (
        <div key={`test-${index}`} className={test.passed ? 'script-line test-pass' : 'script-line test-fail'}>
          {test.passed ? '✓' : '✗'} {test.name}
          {test.message ? ` — ${test.message}` : ''}
        </div>
      ))}
      {scripts.console.length > 0 && <h4 className="script-console-title">Console</h4>}
      {scripts.console.map((entry, index) => (
        <div key={`console-${index}`} className={`script-line console-${entry.level}`}>
          {entry.text}
        </div>
      ))}
    </div>
  );
}
