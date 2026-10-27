// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parseCurlCommand } from '../../core/curl';
import { importPastedCurl } from '../../core/curlPaste';
import { createRequest } from '../../core/factories';
import { RequestModel } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postToHost: vi.fn() }));

import { App } from '../App';

afterEach(cleanup);

const COUNTRIES_CURL = `curl -X POST https://countries.trevorblades.com/ -H 'Content-Type: application/json' -d '{"query":"{ country(code:\\"BE\\"){ name capital } }"}'`;
const COUNTRIES_QUERY = '{ country(code:"BE"){ name capital } }';

function loadIntoApp(request: RequestModel) {
  render(<App />);
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'load', request, collectionName: 'Demo' } }));
  });
}

function queryEditorValue(): string {
  return (screen.getByLabelText('GraphQL query') as HTMLTextAreaElement).value;
}

describe('GraphQL request imported from cURL', () => {
  it('opens on the Query tab showing the query text when loaded from a collection', () => {
    loadIntoApp(parseCurlCommand(COUNTRIES_CURL).request);
    expect(screen.getByRole('tab', { name: 'Query' }).getAttribute('aria-selected')).toBe('true');
    expect(queryEditorValue()).toBe(COUNTRIES_QUERY);
  });

  it('switches to the Query tab when the cURL is pasted into an HTTP request', () => {
    loadIntoApp(createRequest('Blank', () => 'blank'));
    const urlField = screen.getByLabelText('Request URL');
    fireEvent.click(screen.getByRole('tab', { name: 'Headers' }));
    fireEvent.paste(urlField, { clipboardData: { getData: () => COUNTRIES_CURL } });
    expect(screen.getByRole('tab', { name: 'Query' }).getAttribute('aria-selected')).toBe('true');
    expect(queryEditorValue()).toBe(COUNTRIES_QUERY);
  });

  it('keeps variables and operation name from a GraphQL payload', () => {
    const payload = JSON.stringify({ query: 'query Q($c: ID!) { country(code:$c){ name } }', variables: { c: 'BE' }, operationName: 'Q' });
    const { request } = importPastedCurl(createRequest('Blank', () => 'blank'), `curl https://x.test/graphql -H "Content-Type: application/json" --data-raw '${payload}'`);
    loadIntoApp(request);
    expect((screen.getByLabelText('GraphQL variables') as HTMLTextAreaElement).value).toContain('"c": "BE"');
  });
});
