// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KafkaTopicConfigEntry } from '../../shared/kafkaAdminTypes';
import { exportAsCsv } from '../../core/kafka/messageExport';
import { KafkaMessage } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postKafkaMessage: vi.fn() }));

import { IncreasePartitions } from '../kafka/admin/IncreasePartitions';
import { TopicConfigEditor } from '../kafka/admin/TopicConfigEditor';
import { LogFilePanel } from '../kafka/LogFilePanel';
import { ValueViewer } from '../kafka/ValueViewer';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => void vi.stubGlobal('ResizeObserver', StubResizeObserver));
afterEach(cleanup);

const entry = (name: string, value: string | null, overrides: Partial<KafkaTopicConfigEntry> = {}): KafkaTopicConfigEntry => ({
  name,
  value,
  isDefault: false,
  readOnly: false,
  sensitive: false,
  ...overrides,
});

const message = (overrides: Partial<KafkaMessage> = {}): KafkaMessage => ({
  id: 'orders-0-1',
  flowId: 'f',
  timestamp: 1700000000000,
  topic: 'orders',
  partition: 0,
  offset: '1',
  key: 'k',
  value: 'v',
  ...overrides,
});

describe('TopicConfigEditor', () => {
  const configs = [entry('retention.ms', '1000'), entry('cleanup.policy', 'delete', { isDefault: true }), entry('ro', '1', { readOnly: true }), entry('secret', null, { sensitive: true })];

  it('marks read-only and sensitive configs and disables actions until something changes', () => {
    render(<TopicConfigEditor topic="orders" configs={configs} onAlter={vi.fn()} />);
    expect(screen.getByText('read-only')).toBeTruthy();
    expect(screen.getByText('sensitive')).toBeTruthy();
    expect(screen.queryByLabelText('Value of ro')).toBeNull();
    expect((screen.getByRole('button', { name: 'Validate' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('validates without confirmation and applies only after confirming', () => {
    const onAlter = vi.fn();
    render(<TopicConfigEditor topic="orders" configs={configs} onAlter={onAlter} />);
    fireEvent.change(screen.getByLabelText('Value of retention.ms'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(onAlter).toHaveBeenLastCalledWith({ 'retention.ms': '5000' }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(onAlter).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onAlter).toHaveBeenLastCalledWith({ 'retention.ms': '5000' }, false);
  });

  it('resets an override to its default', () => {
    const onAlter = vi.fn();
    render(<TopicConfigEditor topic="orders" configs={configs} onAlter={onAlter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset retention.ms to default' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(onAlter).toHaveBeenCalledWith({ 'retention.ms': null }, true);
  });
});

describe('IncreasePartitions', () => {
  it('only enables a confirmed increase above the current count', () => {
    const onIncrease = vi.fn();
    render(<IncreasePartitions topic="orders" currentPartitions={3} onIncrease={onIncrease} />);
    const trigger = screen.getByRole('button', { name: 'Increase partitions' }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('New partition count'), { target: { value: '2' } });
    expect(trigger.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('New partition count'), { target: { value: '6' } });
    fireEvent.click(trigger);
    expect(onIncrease).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onIncrease).toHaveBeenCalledWith(6);
  });
});

describe('ValueViewer tombstones', () => {
  it('shows null (tombstone) for tombstones but not for empty strings', () => {
    const { rerender } = render(<ValueViewer message={message({ value: '', tombstone: true })} />);
    expect(screen.getByText('null (tombstone)')).toBeTruthy();
    rerender(<ValueViewer message={message({ value: '', tombstone: false })} />);
    expect(screen.queryByText('null (tombstone)')).toBeNull();
  });
});

describe('LogFilePanel CSV import', () => {
  it('shows messages imported from a Routiq CSV export', () => {
    const csv = exportAsCsv([message({ key: 'csv-key-1', value: 'multi\nline ✓' }), message({ key: 'csv-key-2', offset: '2', value: '', tombstone: true })]);
    render(<LogFilePanel logFile={{ name: 'export.csv', text: csv }} />);
    expect(screen.getAllByText('csv-key-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('csv-key-2').length).toBeGreaterThan(0);
  });
});

describe('LogFilePanel browsing controls', () => {
  const renderTwoFlows = () => {
    const csv = exportAsCsv([
      message({ id: 'a-0-1', flowId: 'flow-a', key: 'key-a', offset: '1' }),
      message({ id: 'b-0-2', flowId: 'flow-b', key: 'key-b', offset: '2', timestamp: 1700000001000 }),
    ]);
    render(<LogFilePanel logFile={{ name: 'export.csv', text: csv }} />);
  };

  it('collapses and expands every flow', () => {
    renderTwoFlows();
    expect(screen.getAllByTestId('kafka-message')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryAllByTestId('kafka-message')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByTestId('kafka-message')).toHaveLength(2);
  });

  it('selects all visible entries and clears the selection', () => {
    renderTwoFlows();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText('2 selected')).toBeNull();
  });

  it('opens the detail panel on click, moves with arrow keys and closes with Escape', () => {
    renderTwoFlows();
    expect(screen.queryByTestId('kafka-message-detail')).toBeNull();
    const rows = screen.getAllByLabelText('Show message details');
    fireEvent.click(rows[0]);
    expect(screen.getByTestId('kafka-message-detail')).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Resize message detail' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(screen.getAllByTestId('kafka-message')[1].getAttribute('data-open')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('kafka-message-detail')).toBeNull();
  });
});
