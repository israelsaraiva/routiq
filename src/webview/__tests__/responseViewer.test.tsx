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
