// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { KeyValue, ResponseModel } from '../../shared/types';

const postToHost = vi.fn();
vi.mock('../vscodeApi', () => ({ postToHost: (message: unknown) => postToHost(message) }));

import { AutocompleteInput, VariableSuggestionsContext } from '../AutocompleteInput';
import { ConnectionBar } from '../ConnectionBar';
import { KeyValueTable } from '../KeyValueTable';
import { RequestToolbar } from '../RequestToolbar';
import { ResponseViewer } from '../ResponseViewer';
import { SplitPane } from '../SplitPane';

function installMemoryLocalStorage(): void {
  const entries = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  };
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
}

beforeEach(() => {
  installMemoryLocalStorage();
  postToHost.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function activate(element: HTMLElement): void {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

function isChecked(element: HTMLElement): boolean {
  return element.getAttribute('aria-checked') === 'true' || (element as HTMLInputElement).checked === true;
}

function StatefulTable({ initial, allowSecrets }: { initial: KeyValue[]; allowSecrets?: boolean }) {
  const [rows, setRows] = useState(initial);
  return <KeyValueTable rows={rows} onChange={setRows} allowSecrets={allowSecrets} />;
}

function okResponse(overrides: Partial<ResponseModel> = {}): ResponseModel {
  return {
    status: 200,
    statusText: 'OK',
    timeMs: 12,
    sizeBytes: 2048,
    headers: [['content-type', 'application/json']],
    body: '{"name":"routiq","items":[1,2]}',
    ...overrides,
  };
}

describe('KeyValueTable', () => {
  it('adds, edits, toggles and removes rows', () => {
    render(<StatefulTable initial={[{ key: 'a', value: '1', enabled: true }]} />);
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getAllByPlaceholderText('Key')).toHaveLength(2);

    fireEvent.change(screen.getAllByPlaceholderText('Key')[1], { target: { value: 'b' } });
    expect((screen.getAllByPlaceholderText('Key')[1] as HTMLInputElement).value).toBe('b');

    activate(screen.getAllByLabelText('Enabled')[0]);
    expect(isChecked(screen.getAllByLabelText('Enabled')[0])).toBe(false);

    fireEvent.click(screen.getAllByLabelText('Remove')[0]);
    expect(screen.getAllByPlaceholderText('Key')).toHaveLength(1);
    expect((screen.getByPlaceholderText('Key') as HTMLInputElement).value).toBe('b');
  });

  it('masks secret values and toggles secrecy when allowed', () => {
    render(<StatefulTable allowSecrets initial={[{ key: 'token', value: 'x', enabled: true }]} />);
    expect(screen.queryByPlaceholderText('Secret value')).toBeNull();
    fireEvent.click(screen.getByLabelText('Toggle secret'));
    expect(screen.getByPlaceholderText('Secret value').getAttribute('type')).toBe('password');
  });
});

describe('AutocompleteInput', () => {
  const suggestions = [{ name: 'baseUrl', source: 'Collection' }, { name: 'token', source: 'Environment' }];

  function Harness() {
    const [value, setValue] = useState('');
    return (
      <VariableSuggestionsContext.Provider value={suggestions as never}>
        <AutocompleteInput value={value} onChange={setValue} ariaLabel="field" />
      </VariableSuggestionsContext.Provider>
    );
  }

  it('offers variable suggestions after {{ and inserts the chosen one on Enter', () => {
    render(<Harness />);
    const field = screen.getByLabelText('field') as HTMLInputElement;
    field.setSelectionRange(2, 2);
    fireEvent.change(field, { target: { value: '{{ba', selectionStart: 4 } });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('{{baseUrl}}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes suggestions on Escape', () => {
    render(<Harness />);
    const field = screen.getByLabelText('field') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '{{', selectionStart: 2 } });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('SplitPane', () => {
  it('renders both panes and resizes with the keyboard', () => {
    render(<SplitPane first={<p>request side</p>} second={<p>response side</p>} />);
    expect(screen.getByText('request side')).toBeTruthy();
    expect(screen.getByText('response side')).toBeTruthy();
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(handle.getAttribute('aria-valuenow')).toBe('53');
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
  });

  it('toggles orientation and persists the layout', () => {
    render(<SplitPane first={<p>a</p>} second={<p>b</p>} />);
    fireEvent.click(screen.getByLabelText('Toggle split orientation'));
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');
    expect(JSON.parse(window.localStorage.getItem('routiq.splitLayout') ?? '{}').orientation).toBe('horizontal');
  });
});

describe('ResponseViewer', () => {
  it('shows the empty state without a response', () => {
    render(<ResponseViewer response={undefined} sending={false} />);
    expect(screen.getByText('No response yet')).toBeTruthy();
  });

  it('shows a loading skeleton while sending', () => {
    render(<ResponseViewer response={okResponse()} sending />);
    expect(screen.getByRole('status', { name: 'Sending request' })).toBeTruthy();
  });

  it('shows an error card for failed requests', () => {
    render(<ResponseViewer response={okResponse({ status: 0, error: 'connect ECONNREFUSED' })} sending={false} />);
    expect(screen.getByRole('alert').textContent).toContain('connect ECONNREFUSED');
  });

  it('shows status, body, headers tab, JSON path filter and search', () => {
    render(<ResponseViewer response={okResponse()} sending={false} />);
    expect(screen.getByText('200 OK')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(document.querySelector('.response-body')?.textContent).toContain('"name": "routiq"');

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.change(screen.getByLabelText('JSON path filter'), { target: { value: '$.name' } });
    expect(document.querySelector('.response-body')?.textContent).toContain('routiq');
    expect(document.querySelector('.response-body')?.textContent).not.toContain('items');
    fireEvent.change(screen.getByLabelText('JSON path filter'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Find in response'), { target: { value: 'items' } });
    expect(document.querySelector('.match-count')?.textContent).toBe('1/1');

    activate(screen.getByText('Headers (1)'));
    expect(screen.getByText('content-type')).toBeTruthy();
  });

  it('switches between pretty and raw and numbers each line', () => {
    render(<ResponseViewer response={okResponse()} sending={false} />);
    expect(document.querySelectorAll('.code-line').length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Raw' }));
    expect(document.querySelectorAll('.code-line').length).toBe(1);
  });

  it('copies a header value', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ResponseViewer response={okResponse()} sending={false} />);
    activate(screen.getByText('Headers (1)'));
    fireEvent.click(screen.getByLabelText('Copy content-type value'));
    expect(writeText).toHaveBeenCalledWith('application/json');
  });

  it('posts the body when saving', () => {
    render(<ResponseViewer response={okResponse()} sending={false} />);
    fireEvent.click(screen.getByLabelText('Save body to file'));
    expect(postToHost).toHaveBeenCalledWith(expect.objectContaining({ type: 'saveResponseBody' }));
  });

  it('shows a tests tab only when scripts ran', () => {
    const scripts = { tests: [{ name: 'ok', passed: true }], console: [], errors: [] };
    render(<ResponseViewer response={okResponse({ scripts })} sending={false} />);
    expect(screen.getByText(/Tests/i)).toBeTruthy();
  });
});

describe('RequestToolbar', () => {
  it('renders the environment selector showing the active environment and an actions menu', () => {
    render(
      <RequestToolbar
        environments={[{ id: 'e1', name: 'Staging' }]}
        activeEnvironmentId="e1"
        onSelectEnvironment={vi.fn()}
        onManageEnvironments={vi.fn()}
        onCopyCurl={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Environment').textContent).toContain('Staging');
    expect(screen.getByLabelText('More actions')).toBeTruthy();
  });
});

describe('ConnectionBar', () => {
  it('offers Connect when idle and Disconnect when open', () => {
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const { rerender } = render(<ConnectionBar status="idle" onConnect={onConnect} onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByText('Connect'));
    expect(onConnect).toHaveBeenCalled();
    rerender(<ConnectionBar status="open" detail="HTTP 200" onConnect={onConnect} onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByText('Disconnect'));
    expect(onDisconnect).toHaveBeenCalled();
    expect(screen.getByText('HTTP 200')).toBeTruthy();
  });
});
