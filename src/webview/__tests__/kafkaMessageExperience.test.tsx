// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_FILTER } from '../../core/kafka/messageFilter';
import { KafkaHighlightRule, KafkaMessageFilter, KafkaSavedFilter } from '../../shared/kafkaMessageTypes';
import { KafkaMessage } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postKafkaMessage: vi.fn() }));

import { CompareDialog } from '../kafka/CompareDialog';
import { FilterBar } from '../kafka/FilterBar';
import { JsonTree } from '../kafka/JsonTree';
import { MessageCard } from '../kafka/MessageCard';
import { RulesDialog } from '../kafka/RulesDialog';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});
afterEach(cleanup);

function message(id: string, value: string): KafkaMessage {
  return { id, topic: 'orders', partition: 0, offset: id, timestamp: 1, value, flowId: id } as KafkaMessage;
}

describe('FilterBar', () => {
  function Harness({ onFilter, onSaved }: { onFilter: (f: KafkaMessageFilter) => void; onSaved: (s: KafkaSavedFilter[]) => void }) {
    const [filter, setFilter] = useState<KafkaMessageFilter>(EMPTY_FILTER);
    const [saved, setSaved] = useState<KafkaSavedFilter[]>([]);
    return (
      <FilterBar
        filter={filter}
        onChange={(next) => {
          setFilter(next);
          onFilter(next);
        }}
        savedFilters={saved}
        onSavedFiltersChange={(next) => {
          setSaved(next);
          onSaved(next);
        }}
      />
    );
  }

  it('toggles regex and saves and deletes a named filter', () => {
    const onFilter = vi.fn();
    const onSaved = vi.fn();
    render(<Harness onFilter={onFilter} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'fail.*' } });
    fireEvent.click(screen.getByTitle('Use regular expression'));
    expect(onFilter).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'fail.*', regex: true }));
    fireEvent.change(screen.getByLabelText('Saved filter name'), { target: { value: 'Failures' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save filter' }));
    expect(onSaved).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Failures' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete filter Failures' }));
    expect(onSaved).toHaveBeenLastCalledWith([]);
  });
});

describe('JsonTree', () => {
  it('copies a path and collapses all', () => {
    const onCopy = vi.fn();
    render(<JsonTree value={{ user: { name: 'ann' } }} onCopy={onCopy} />);
    fireEvent.click(screen.getByText('Expand all'));
    fireEvent.click(screen.getByText('name'));
    expect(onCopy).toHaveBeenCalledWith('$.user.name');
    fireEvent.click(screen.getByText('Collapse all'));
    expect(screen.queryByText('name')).toBeNull();
  });

  it('renders keys as plain text and ignores clicks while text is selected', () => {
    const onCopy = vi.fn();
    render(<JsonTree value={{ user: { name: 'ann' } }} onCopy={onCopy} />);
    fireEvent.click(screen.getByText('Expand all'));
    const key = screen.getByText('name');
    expect(key.tagName).toBe('SPAN');
    const selectValue = () => window.getSelection()?.selectAllChildren(screen.getByText(/ann/));
    selectValue();
    fireEvent.click(key);
    expect(onCopy).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
    fireEvent.click(key);
    expect(onCopy).toHaveBeenCalledWith('$.user.name');
  });

  it('toggles a container with the caret', () => {
    render(<JsonTree value={{ user: { name: 'ann' } }} onCopy={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand $.user' }));
    expect(screen.getByText('name')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse $.user' }));
    expect(screen.queryByText('name')).toBeNull();
  });

  it('highlights search matches and opens their ancestors', () => {
    render(<JsonTree value={{ user: { name: 'ann' } }} searchTerm="ann" onCopy={vi.fn()} />);
    expect(document.querySelector('.kafka-tree-match')?.textContent).toBe('ann');
  });
});

describe('RulesDialog', () => {
  it('adds a rule and saves it', () => {
    const onChange = vi.fn();
    const rules: KafkaHighlightRule[] = [];
    render(<RulesDialog rules={rules} hits={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Rules/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    fireEvent.change(screen.getByLabelText('Rule name 1'), { target: { value: 'Errors' } });
    fireEvent.change(screen.getByLabelText('Rule pattern 1'), { target: { value: 'ERROR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'Errors', pattern: 'ERROR' })]);
  });
});

describe('CompareDialog', () => {
  it('marks differing lines on both sides', () => {
    render(<CompareDialog messages={[message('1', '{"a":1}'), message('2', '{"a":2}')]} onClose={vi.fn()} />);
    const compare = screen.getByTestId('kafka-compare');
    expect(compare.querySelectorAll('[data-diff="removed"]').length).toBeGreaterThan(0);
    expect(compare.querySelectorAll('[data-diff="added"]').length).toBeGreaterThan(0);
  });
});

describe('MessageCard chip titles', () => {
  const chipMessage = { ...message('42', '{}'), topic: 'orders.created.v1', partition: 0, offset: '42' } as KafkaMessage;

  it('shows the full topic name as the topic chip title', () => {
    render(<MessageCard message={chipMessage} selected={false} onSelectedChange={() => undefined} onCopy={() => undefined} />);
    const chip = screen.getByText('orders.created.v1');
    expect(chip.getAttribute('title')).toBe('orders.created.v1');
  });

  it('describes partition and offset in the offset chip title', () => {
    render(<MessageCard message={chipMessage} selected={false} onSelectedChange={() => undefined} onCopy={() => undefined} />);
    expect(screen.getByText('0:42').getAttribute('title')).toBe('partition 0, offset 42');
  });
});
