// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KafkaHostMessage, KafkaMessage, KafkaProfileView } from '../../shared/types';

const postKafkaMessage = vi.fn();
vi.mock('../vscodeApi', () => ({ postKafkaMessage: (message: unknown) => postKafkaMessage(message) }));

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

const message = (id: string, flowId: string, value = '{"resource":{"commandId":"Create:1"}}'): KafkaMessage => ({
  id,
  flowId,
  timestamp: Date.now(),
  topic: 'orders',
  partition: 0,
  offset: id,
  key: null,
  value,
});

function dispatchHost(data: KafkaHostMessage) {
  act(() => void window.dispatchEvent(new MessageEvent('message', { data })));
}

function init(messages: KafkaMessage[] = []) {
  dispatchHost({ type: 'kafkaInit', profiles: [profile], activeProfileId: 'p1', collections: [], maxMessages: 100, status: { state: 'disconnected' }, messages });
}

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  postKafkaMessage.mockClear();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});
afterEach(cleanup);

describe('KafkaView', () => {
  it('announces readiness and loads the active profile', () => {
    render(<KafkaView />);
    expect(postKafkaMessage).toHaveBeenCalledWith({ type: 'kafkaReady' });
    init();
    expect(screen.getByDisplayValue('localhost:9092')).toBeTruthy();
    expect(screen.getByDisplayValue('orders')).toBeTruthy();
  });

  it('connects with the edited profile', () => {
    render(<KafkaView />);
    init();
    fireEvent.change(screen.getByDisplayValue('orders'), { target: { value: 'orders,payments' } });
    fireEvent.click(screen.getByRole('button', { name: /Connect/ }));
    expect(postKafkaMessage).toHaveBeenCalledWith({ type: 'kafkaConnect', profile: expect.objectContaining({ id: 'p1', topics: 'orders,payments' }) });
  });

  it('shows disconnect while connected and the status detail', () => {
    render(<KafkaView />);
    init();
    dispatchHost({ type: 'kafkaStatus', status: { state: 'connected' } });
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeTruthy();
  });

  it('groups messages by flow and counts them', () => {
    render(<KafkaView />);
    init([message('1', 'flow-a'), message('2', 'flow-a'), message('3', 'flow-b')]);
    expect(screen.getAllByTestId('kafka-flow')).toHaveLength(2);
    expect(screen.getByText('2 flows')).toBeTruthy();
    expect(screen.getByText('3 messages')).toBeTruthy();
  });

  it('appends live messages and filters them with the search box', () => {
    render(<KafkaView />);
    init([message('1', 'flow-a', '{"user":"ana"}')]);
    dispatchHost({ type: 'kafkaMessages', messages: [message('2', 'flow-b', '{"user":"bob"}')], replace: false });
    expect(screen.getAllByTestId('kafka-message')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'bob' } });
    expect(screen.getAllByTestId('kafka-message')).toHaveLength(1);
  });

  it('freezes the list while paused and reports pending messages', () => {
    render(<KafkaView />);
    init([message('1', 'flow-a')]);
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    dispatchHost({ type: 'kafkaMessages', messages: [message('2', 'flow-b')], replace: false });
    expect(screen.getAllByTestId('kafka-message')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Resume \(1 new\)/ })).toBeTruthy();
  });

  it('copies a message through the host', () => {
    render(<KafkaView />);
    init([message('1', 'flow-a')]);
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(postKafkaMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'kafkaCopy' }));
  });

  it('sends a message and blocks invalid headers', () => {
    render(<KafkaView />);
    init([message('1', 'flow-a')]);
    fireEvent.click(screen.getByRole('button', { name: 'Use for Send' }));
    const send = () => fireEvent.click(screen.getByRole('button', { name: /Send message/ }));
    fireEvent.change(screen.getByLabelText('Headers (JSON object, optional)'), { target: { value: '{' } });
    send();
    expect(screen.getByText('Headers must be valid JSON')).toBeTruthy();
    expect(postKafkaMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'kafkaProduce' }));
    fireEvent.change(screen.getByLabelText('Headers (JSON object, optional)'), { target: { value: '{"a":"b"}' } });
    send();
    expect(postKafkaMessage).toHaveBeenCalledWith({
      type: 'kafkaProduce',
      request: expect.objectContaining({ topic: 'orders', headers: { a: 'b' }, profile: expect.objectContaining({ id: 'p1' }) }),
    });
  });
});
