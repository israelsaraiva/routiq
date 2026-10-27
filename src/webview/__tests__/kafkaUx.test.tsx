// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KafkaConnectionState, KafkaHostMessage, KafkaMessage, KafkaProfileView } from '../../shared/types';

const postKafkaMessage = vi.fn();
vi.mock('../vscodeApi', () => ({ postKafkaMessage: (message: unknown) => postKafkaMessage(message) }));

import { ConnectionStatus } from '../kafka/ConnectionStatus';
import { KafkaView } from '../kafka/KafkaView';

const profile: KafkaProfileView = {
  id: 'p1',
  name: 'Local',
  brokers: 'localhost:9092',
  topics: 'orders',
  fromBeginning: false,
  groupId: '',
  ssl: false,
  saslMechanism: 'none',
  saslUsername: '',
  hasSaslPassword: false,
};

const message = (id: string, value = '{"a":1}'): KafkaMessage => ({ id, flowId: `flow-${id}`, timestamp: Date.now(), topic: 'orders', partition: 0, offset: id, key: null, value });

function dispatchHost(data: KafkaHostMessage) {
  act(() => void window.dispatchEvent(new MessageEvent('message', { data })));
}

function init(messages: KafkaMessage[] = [], state: KafkaConnectionState = 'disconnected') {
  dispatchHost({ type: 'kafkaInit', profiles: [profile], activeProfileId: 'p1', collections: [], maxMessages: 100, status: { state }, messages });
}

function press(key: string, target: Element = document.body) {
  act(() => void fireEvent.keyDown(target, { key }));
}

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value),
  };
}

beforeEach(() => {
  postKafkaMessage.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});
afterEach(cleanup);

describe('ConnectionStatus', () => {
  it.each([
    ['connected', 'Connected', 'Disconnect'],
    ['connecting', 'Connecting', 'Disconnect'],
    ['reconnecting', 'Reconnecting (attempt 2)', 'Stop reconnecting'],
    ['error', 'Error', 'Connect'],
    ['disconnected', 'Disconnected', 'Connect'],
  ] as const)('shows %s with its text and matching action', (state, label, action) => {
    render(<ConnectionStatus status={{ state, attempt: 2 }} messages={[]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(label);
    expect(screen.getByRole('button', { name: new RegExp(`^${action}$`) })).toBeTruthy();
  });

  it('counts down to the next reconnect attempt', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
    render(<ConnectionStatus status={{ state: 'reconnecting', attempt: 3, nextRetryAt: 1_005_000 }} messages={[]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Reconnecting in 5s (attempt 3)');
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status').textContent).toContain('Reconnecting in 3s (attempt 3)');
    vi.useRealTimers();
  });

  it('shows the total lag only while connected', () => {
    const { rerender } = render(<ConnectionStatus status={{ state: 'connected' }} totalLag={42} messages={[]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByText('Lag 42')).toBeTruthy();
    rerender(<ConnectionStatus status={{ state: 'connected' }} messages={[]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.queryByText(/^Lag/)).toBeNull();
    rerender(<ConnectionStatus status={{ state: 'disconnected' }} totalLag={42} messages={[]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.queryByText(/^Lag/)).toBeNull();
  });

  it('shows the message count and rate only while connected', () => {
    const { rerender } = render(<ConnectionStatus status={{ state: 'connected' }} messages={[message('1'), message('2')]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByText('2 received')).toBeTruthy();
    expect(screen.getByText('0.2 msg/s')).toBeTruthy();
    rerender(<ConnectionStatus status={{ state: 'disconnected' }} messages={[message('1')]} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.queryByText(/msg\/s/)).toBeNull();
  });
});

describe('Kafka message detail panel', () => {
  const openFirst = () => fireEvent.click(screen.getAllByLabelText('Show message details')[0]);

  it('follows the selection with arrows while open', () => {
    render(<KafkaView />);
    init([message('1', '{"n":1}'), message('2', '{"n":2}')]);
    openFirst();
    expect(screen.getByTestId('kafka-message-detail').textContent).toContain('0:1');
    press('ArrowDown');
    expect(screen.getByTestId('kafka-message-detail').textContent).toContain('0:2');
  });

  it('resizes with the keyboard and remembers the size', () => {
    const { unmount } = render(<KafkaView />);
    init([message('1')]);
    openFirst();
    const handle = screen.getByRole('separator', { name: 'Resize message detail' });
    const before = Number(handle.getAttribute('aria-valuenow'));
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
    const resized = handle.getAttribute('aria-valuenow');
    unmount();
    render(<KafkaView />);
    init([message('1')]);
    openFirst();
    expect(screen.getByRole('separator', { name: 'Resize message detail' }).getAttribute('aria-valuenow')).toBe(resized);
  });

  it('saves the open message as a request from the panel', () => {
    render(<KafkaView />);
    init([message('1')]);
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Save detail as Routiq request' }));
    expect(postKafkaMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'kafkaSaveAsRequest' }));
  });

  it('closes from the close button', () => {
    render(<KafkaView />);
    init([message('1')]);
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    expect(screen.queryByTestId('kafka-message-detail')).toBeNull();
  });
});

describe('Kafka message toolbar options', () => {
  it('collapses rarely used options and remembers the choice', () => {
    const { unmount } = render(<KafkaView />);
    init([message('1')]);
    expect(screen.queryByLabelText('Message options')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Options/ }));
    expect(screen.getByLabelText('Message options')).toBeTruthy();
    expect(screen.getByText('Follow newest')).toBeTruthy();
    unmount();
    render(<KafkaView />);
    init([message('1')]);
    expect(screen.getByRole('button', { name: /Options/ }).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Kafka tabs', () => {
  const openTab = (name: RegExp) => {
    const tab = screen.getByRole('tab', { name });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
  };

  it('badges unseen messages while another tab is active and clears it on return', async () => {
    render(<KafkaView />);
    init([message('1')]);
    openTab(/^Send/);
    dispatchHost({ type: 'kafkaMessages', messages: [message('2'), message('3')], replace: false });
    expect(await screen.findByLabelText('2 unseen messages')).toBeTruthy();
    openTab(/^Messages/);
    expect(screen.queryByLabelText(/unseen messages/)).toBeNull();
  });

  it('keeps the send draft when switching tabs', () => {
    render(<KafkaView />);
    init();
    openTab(/^Send/);
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'typed-topic' } });
    openTab(/^Messages/);
    openTab(/^Send/);
    expect((screen.getByLabelText('Topic') as HTMLInputElement).value).toBe('typed-topic');
  });
});

describe('Kafka keyboard shortcuts', () => {
  it('focuses the filter with slash', () => {
    render(<KafkaView />);
    init([message('1')]);
    press('/');
    expect(document.activeElement).toBe(screen.getByLabelText('Search messages'));
  });

  it('toggles pause with space unless typing', () => {
    render(<KafkaView />);
    init([message('1')]);
    press(' ');
    expect(screen.getByRole('button', { name: /Resume/ })).toBeTruthy();
    press(' ');
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy();
    press(' ', screen.getByLabelText('Search messages'));
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy();
  });

  it('moves the selection with arrows and closes the detail with escape', () => {
    render(<KafkaView />);
    init([message('1'), message('2')]);
    press('ArrowDown');
    press('ArrowDown');
    const [first, second] = screen.getAllByTestId('kafka-message');
    expect(first.getAttribute('data-active')).toBe('false');
    expect(second.getAttribute('data-active')).toBe('true');
    fireEvent.click(screen.getAllByLabelText('Show message details')[1]);
    expect(second.getAttribute('data-open')).toBe('true');
    expect(screen.getByTestId('kafka-message-detail')).toBeTruthy();
    press('Escape');
    expect(second.getAttribute('data-open')).toBe('false');
    expect(screen.queryByTestId('kafka-message-detail')).toBeNull();
  });

  it('ignores shortcuts while another tab is active', () => {
    render(<KafkaView />);
    init([message('1')]);
    const tab = screen.getByRole('tab', { name: /^Send/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    press(' ');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Messages/ }));
    fireEvent.click(screen.getByRole('tab', { name: /^Messages/ }));
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy();
  });
});

describe('Kafka empty state', () => {
  it('offers to start from the last 10 messages', () => {
    render(<KafkaView />);
    init();
    fireEvent.click(screen.getByRole('button', { name: 'Start from last 10 messages' }));
    expect(postKafkaMessage).toHaveBeenCalledWith({
      type: 'kafkaConnect',
      profile: expect.objectContaining({ id: 'p1', startMode: 'lastN', startLastN: 10 }),
    });
  });

  it('shows no action while waiting for messages after connecting', () => {
    render(<KafkaView />);
    init([], 'connected');
    expect(screen.getByText('Waiting for messages…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start from last/ })).toBeNull();
  });
});

describe('Kafka message announcements', () => {
  it('announces new messages politely on an interval', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    render(<KafkaView />);
    init([message('1')]);
    dispatchHost({ type: 'kafkaMessages', messages: [message('2'), message('3')], replace: false });
    act(() => void vi.advanceTimersByTime(100));
    act(() => void vi.advanceTimersByTime(2000));
    const live = document.querySelector('.kafka-sr-only[aria-live="polite"]');
    expect(live?.textContent).toBe('2 new messages');
    vi.useRealTimers();
  });
});

describe('Kafka tombstone row', () => {
  it('marks tombstones distinctly', () => {
    render(<KafkaView />);
    init([{ ...message('1', ''), tombstone: true }]);
    expect(screen.getByText('tombstone')).toBeTruthy();
    expect(screen.getByTestId('kafka-message').getAttribute('data-tombstone')).toBe('true');
  });
});

describe('Send payload preview', () => {
  it('expands template variables live', () => {
    render(<KafkaView />);
    init();
    const tab = screen.getByRole('tab', { name: /^Send/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(screen.queryByLabelText('Payload preview')).toBeNull();
    fireEvent.change(screen.getByLabelText('Message value'), { target: { value: '{"id":{{$index}}}' } });
    expect(screen.getByTestId('kafka-send-preview-value').textContent).toContain('"id": 1');
  });
});
