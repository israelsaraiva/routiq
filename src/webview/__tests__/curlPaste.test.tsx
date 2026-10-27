// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createRequest } from '../../core/factories';
import { RequestModel } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postToHost: vi.fn() }));

import { AutocompleteInput } from '../AutocompleteInput';
import { CurlImportNotice, useCurlPaste } from '../useCurlPaste';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CURL = `curl -X POST 'https://httpbin.org/post?a=1' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"a":1}'`;

function Harness({ initial }: { initial: RequestModel }) {
  const [request, setRequest] = useState(initial);
  const curlPaste = useCurlPaste(request, setRequest);
  return (
    <div>
      <AutocompleteInput ariaLabel="Request URL" value={request.url} onChange={(url) => setRequest({ ...request, url })} onPasteText={curlPaste.handlePaste} />
      <output data-testid="state">{JSON.stringify({ method: request.method, url: request.url, params: request.params.length, name: request.name })}</output>
      {curlPaste.notice && <CurlImportNotice notice={curlPaste.notice} onUndo={curlPaste.undo} onDismiss={curlPaste.dismiss} />}
    </div>
  );
}

function pasteInto(text: string): boolean {
  return fireEvent.paste(screen.getByLabelText('Request URL'), { clipboardData: { getData: () => text } });
}

function currentState() {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}');
}

describe('pasting cURL into the URL field', () => {
  const initial = { ...createRequest('Keep me', () => 'id-1'), url: 'https://old.test' };

  it('imports the command into the request and offers undo', () => {
    render(<Harness initial={initial} />);
    expect(pasteInto(CURL)).toBe(false);
    expect(currentState()).toEqual({ method: 'POST', url: 'https://httpbin.org/post', params: 1, name: 'Keep me' });
    expect(screen.getByText('Imported cURL')).toBeTruthy();

    fireEvent.click(screen.getByText('Undo'));
    expect(currentState()).toEqual({ method: 'GET', url: 'https://old.test', params: 0, name: 'Keep me' });
    expect(screen.queryByText('Imported cURL')).toBeNull();
  });

  it('leaves ordinary pastes alone', () => {
    render(<Harness initial={initial} />);
    expect(pasteInto('https://example.com/curl')).toBe(true);
    expect(screen.queryByText('Imported cURL')).toBeNull();
  });

  it('dismisses the notice automatically', () => {
    vi.useFakeTimers();
    render(<Harness initial={initial} />);
    pasteInto(CURL);
    expect(screen.getByText('Imported cURL')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByText('Imported cURL')).toBeNull();
  });
});
