// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResponseModel } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postToHost: vi.fn() }));

import { ResponseViewer } from '../ResponseViewer';

function responseWith(body: string, contentType = 'application/json'): ResponseModel {
  return { status: 200, statusText: 'OK', timeMs: 5, sizeBytes: body.length, headers: [['content-type', contentType]], body };
}

function renderedBody(): string {
  return Array.from(document.querySelectorAll('.response-body .code-line'), (line) => line.textContent).join('\n');
}

afterEach(cleanup);

describe('ResponseViewer body format', () => {
  const minified = '{"id":12345678901234567890,"tags":["a","b"]}';

  it('shows the body indented by default and the exact original in Raw', () => {
    render(<ResponseViewer response={responseWith(minified)} sending={false} />);
    expect(renderedBody()).toContain('\n  "id": 12345678901234567890,');
    fireEvent.click(screen.getByRole('radio', { name: 'Raw' }));
    expect(renderedBody()).toBe(minified);
    fireEvent.click(screen.getByRole('radio', { name: 'Pretty' }));
    expect(renderedBody()).toContain('\n  "id": 12345678901234567890,');
  });

  it('marks the active format as checked', () => {
    render(<ResponseViewer response={responseWith(minified)} sending={false} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Raw' }));
    expect(screen.getByRole('radio', { name: 'Raw' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Pretty' }).getAttribute('aria-checked')).toBe('false');
  });

  it('pretty prints XML served as text/plain', () => {
    render(<ResponseViewer response={responseWith('<a><b>1</b></a>', 'text/plain')} sending={false} />);
    expect(renderedBody()).toBe('<a>\n  <b>1</b>\n</a>');
  });
});

describe('ResponseViewer network error action', () => {
  const failed = (error: string): ResponseModel => ({ status: 0, statusText: '', timeMs: 1, sizeBytes: 0, headers: [], body: '', error });

  it('offers Diagnose network for timeout and connection errors', () => {
    const onDiagnoseNetwork = vi.fn();
    render(
      <ResponseViewer response={failed('Connect timeout after 10000 ms (direct connection). Check the settings.')} sending={false} onDiagnoseNetwork={onDiagnoseNetwork} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose network' }));
    expect(onDiagnoseNetwork).toHaveBeenCalledTimes(1);
  });

  it('does not offer it for unrelated errors', () => {
    render(<ResponseViewer response={failed('Request aborted')} sending={false} onDiagnoseNetwork={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Diagnose network' })).toBeNull();
  });
});
