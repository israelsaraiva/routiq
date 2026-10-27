// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KafkaGroupDetail as GroupDetailData, KafkaTopicInfo } from '../../shared/kafkaAdminTypes';

vi.mock('../vscodeApi', () => ({ postKafkaMessage: vi.fn() }));

import { CreateTopicDialog } from '../kafka/admin/CreateTopicDialog';
import { GroupDetail } from '../kafka/admin/GroupDetail';
import { LagValue } from '../kafka/admin/LagValue';
import { TopicTable } from '../kafka/admin/TopicTable';
import { INITIAL_ADMIN_STATE, reduceAdminState } from '../kafka/admin/useKafkaAdmin';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => void vi.stubGlobal('ResizeObserver', StubResizeObserver));
afterEach(cleanup);

const orders: KafkaTopicInfo = {
  name: 'orders',
  internal: false,
  replicationFactor: 2,
  messageCount: 1500,
  partitions: [{ partition: 0, leader: 1, replicas: [1, 2], isr: [1], low: '10', high: '1510' }],
};

function renderTable(overrides: Partial<Parameters<typeof TopicTable>[0]> = {}) {
  const handlers = { onLoadConfigs: vi.fn(), onAddToListener: vi.fn(), onConsume: vi.fn(), onDelete: vi.fn() };
  render(<TopicTable topics={[orders]} configs={{}} {...handlers} {...overrides} />);
  return handlers;
}

describe('TopicTable', () => {
  it('shows partitions, replication and approximate message count', () => {
    renderTable();
    expect(screen.getByText('orders')).toBeTruthy();
    expect(screen.getByText('≈ 1,500')).toBeTruthy();
  });

  it('selects a topic for the listener without expanding the row', () => {
    const handlers = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Add orders to listener' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consume orders' }));
    expect(handlers.onAddToListener).toHaveBeenCalledWith('orders');
    expect(handlers.onConsume).toHaveBeenCalledWith('orders');
    expect(handlers.onLoadConfigs).not.toHaveBeenCalled();
  });

  it('expands a row to show partition details and loads configs', () => {
    const handlers = renderTable({ configs: { orders: [{ name: 'retention.ms', value: '1000', isDefault: false, readOnly: false, sensitive: false }] } });
    fireEvent.click(screen.getByText('orders'));
    expect(handlers.onLoadConfigs).toHaveBeenCalledWith('orders');
    expect(screen.getByText('under-replicated')).toBeTruthy();
    expect(screen.getByText('retention.ms')).toBeTruthy();
    expect(screen.getByText('overridden')).toBeTruthy();
  });

  it('asks for confirmation before deleting', () => {
    const handlers = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Delete orders' }));
    expect(handlers.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete topic' }));
    expect(handlers.onDelete).toHaveBeenCalledWith('orders');
  });

  it('tells when nothing matches', () => {
    renderTable({ topics: [] });
    expect(screen.getByText('No topics match.')).toBeTruthy();
  });
});

describe('CreateTopicDialog', () => {
  function renderDialog() {
    const onCreate = vi.fn();
    render(<CreateTopicDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    return onCreate;
  }

  it('rejects invalid input with a message', () => {
    const onCreate = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Create…' }));
    expect(screen.getByText('Topic name is required')).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('requires confirmation and sends the parsed request', () => {
    const onCreate = renderDialog();
    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'payments' } });
    fireEvent.change(screen.getByLabelText('Partitions'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Configs/), { target: { value: 'retention.ms=1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create…' }));
    expect(screen.getByText(/Create topic "payments" with 3 partition\(s\)/)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm create' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'payments', partitions: 3, replicationFactor: 1, configs: { 'retention.ms': '1000' } });
  });
});

describe('lag display', () => {
  const group: GroupDetailData = {
    groupId: 'g1',
    state: 'Stable',
    protocol: 'range',
    totalLag: 12,
    members: [{ memberId: 'm1', clientId: 'client-1', host: '/10.0.0.1', assignments: [{ topic: 'orders', partitions: [0, 1] }] }],
    offsets: [
      { topic: 'orders', partition: 0, committed: '8', logEnd: '10', lag: 2 },
      { topic: 'orders', partition: 1, committed: null, logEnd: '10', lag: 10 },
    ],
  };

  it('marks zero lag as healthy and any lag as a warning', () => {
    const { container } = render(
      <>
        <LagValue lag={0} />
        <LagValue lag={1234} />
      </>,
    );
    expect(container.querySelector('.ui-badge-success')?.textContent).toBe('0');
    expect(container.querySelector('.ui-badge-warning')?.textContent).toBe('1,234');
  });

  it('shows per partition lag, total lag and member assignments', () => {
    render(<GroupDetail group={group} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getByText('orders[0,1]')).toBeTruthy();
    expect(screen.getByText('client-1')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('reduceAdminState', () => {
  it('stores results, clears pending and surfaces errors per area', () => {
    const sent = reduceAdminState(INITIAL_ADMIN_STATE, { type: 'sent', requestId: 'r1', kind: 'listTopics' });
    expect(sent.pending).toEqual({ r1: 'listTopics' });
    const loaded = reduceAdminState(sent, { type: 'result', result: { requestId: 'r1', command: 'listTopics', data: { kind: 'topics', topics: [orders] } } });
    expect(loaded.topics).toEqual([orders]);
    expect(loaded.pending).toEqual({});
    const failed = reduceAdminState(loaded, { type: 'result', result: { requestId: 'r2', command: 'listGroups', error: 'Not authorized' } });
    expect(failed.errors.groups).toBe('Not authorized');
    expect(failed.errors.topics).toBeUndefined();
  });

  it('keeps a notice for completed mutations and clears it on the next result', () => {
    const done = reduceAdminState(INITIAL_ADMIN_STATE, { type: 'result', result: { requestId: 'r', command: 'deleteTopic', data: { kind: 'done', message: 'Deleted' } } });
    expect(done.notices.topics).toBe('Deleted');
    const next = reduceAdminState(done, { type: 'result', result: { requestId: 'r', command: 'listTopics', data: { kind: 'topics', topics: [] } } });
    expect(next.notices.topics).toBeUndefined();
  });
});
