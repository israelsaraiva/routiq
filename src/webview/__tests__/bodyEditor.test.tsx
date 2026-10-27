// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RequestBody } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postToHost: vi.fn() }));

import { BodyEditor } from '../BodyEditor';

function bodyOf(type: RequestBody['type'], text: string): RequestBody {
  return { type, text, form: [] };
}

function renderEditor(body: RequestBody) {
  const onChange = vi.fn();
  render(<BodyEditor body={body} onChange={onChange} />);
  return onChange;
}

afterEach(cleanup);

describe('BodyEditor formatting', () => {
  it('prettifies JSON with unquoted placeholders', () => {
    const onChange = renderEditor(bodyOf('json', '{"id": {{userId}}, "name": "{{name}}"}'));
    fireEvent.click(screen.getByText('Prettify'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: '{\n  "id": {{userId}},\n  "name": "{{name}}"\n}' }));
  });

  it('minifies JSON', () => {
    const onChange = renderEditor(bodyOf('json', '{\n  "a": 1\n}'));
    fireEvent.click(screen.getByText('Minify'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: '{"a":1}' }));
  });

  it('shows the error position and keeps the text when JSON is invalid', () => {
    const onChange = renderEditor(bodyOf('json', '{"a": }'));
    expect(screen.getByText('Invalid JSON · line 1, col 7')).toBeTruthy();
    fireEvent.click(screen.getByText('Prettify'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid JSON · line 1, col 7')).toBeTruthy();
  });

  it('shows a valid indicator for valid JSON', () => {
    renderEditor(bodyOf('json', '{"a": 1}'));
    expect(screen.getByText('Valid JSON')).toBeTruthy();
  });

  it('prettifies on Shift+Alt+F inside the editor', () => {
    const onChange = renderEditor(bodyOf('xml', '<a><b>1</b></a>'));
    fireEvent.keyDown(screen.getByRole('textbox'), { code: 'KeyF', shiftKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: '<a>\n  <b>1</b>\n</a>' }));
  });

  it('offers Minify only for JSON', () => {
    renderEditor(bodyOf('text', 'hello'));
    expect(screen.getByText('Prettify')).toBeTruthy();
    expect(screen.queryByText('Minify')).toBeNull();
    expect(screen.queryByText(/JSON/)).toBeNull();
  });
});
