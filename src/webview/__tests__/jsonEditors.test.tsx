// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRequest } from '../../core/factories';
import { RequestModel } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postToHost: vi.fn() }));

import { GraphqlEditor } from '../GraphqlEditor';
import { JsonTextEditor } from '../JsonTextEditor';
import { WebSocketPanel } from '../WebSocketPanel';

afterEach(cleanup);

function graphqlRequest(variables: string): RequestModel {
  const request = createRequest('Q', () => 'q');
  return { ...request, body: { ...request.body, type: 'graphql', text: '{ a }', graphqlVariables: variables } };
}

describe('GraphQL variables editor', () => {
  function renderVariables(variables: string) {
    const onChange = vi.fn();
    render(<GraphqlEditor request={graphqlRequest(variables)} onChange={onChange} />);
    return onChange;
  }

  function variablesTextarea() {
    return screen.getByLabelText('GraphQL variables');
  }

  it('prettifies variables on Shift+Alt+F keeping placeholders', () => {
    const onChange = renderVariables('{"id": {{userId}}, "n": "{{n}}"}');
    fireEvent.keyDown(variablesTextarea(), { code: 'KeyF', shiftKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith({ body: expect.objectContaining({ graphqlVariables: '{\n  "id": {{userId}},\n  "n": "{{n}}"\n}' }) });
  });

  it('minifies variables with the Minify button', () => {
    const onChange = renderVariables('{\n  "a": 1\n}');
    fireEvent.click(screen.getAllByText('Minify')[0]);
    expect(onChange).toHaveBeenCalledWith({ body: expect.objectContaining({ graphqlVariables: '{"a":1}' }) });
  });

  it('shows line and column and leaves invalid variables unchanged', () => {
    const onChange = renderVariables('{"a": }');
    expect(screen.getByText('Invalid JSON · line 1, col 7')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Minify')[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a valid indicator for valid variables', () => {
    renderVariables('{"a": 1}');
    expect(screen.getByText('Valid JSON')).toBeTruthy();
  });
});

describe('JsonTextEditor', () => {
  it('prettifies on Shift+Alt+F', () => {
    const onChange = vi.fn();
    render(<JsonTextEditor ariaLabel="gRPC message" text='{"a":[1,2]}' onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText('gRPC message'), { code: 'KeyF', shiftKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith('{\n  "a": [\n    1,\n    2\n  ]\n}');
  });
});

describe('WebSocket composer JSON mode', () => {
  function renderComposerInJsonMode() {
    render(<WebSocketPanel status="open" entries={[]} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Message format' }));
    fireEvent.click(screen.getByRole('option', { name: 'JSON' }));
  }

  it('offers Prettify and Minify and formats the draft', () => {
    renderComposerInJsonMode();
    const draft = screen.getByPlaceholderText('{"hello": "world"}') as HTMLTextAreaElement;
    fireEvent.change(draft, { target: { value: '{"a":1}' } });
    fireEvent.click(screen.getByText('Prettify'));
    expect(draft.value).toBe('{\n  "a": 1\n}');
    fireEvent.click(screen.getByText('Minify'));
    expect(draft.value).toBe('{"a":1}');
  });
});
