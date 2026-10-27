// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_SEND_DRAFT, SendDraft } from '../../core/kafka/sendJob';
import { KafkaJobProgress } from '../../shared/kafkaProduceTypes';
import { KafkaMessage, KafkaProfileView } from '../../shared/types';
import { ReplayDialog } from '../kafka/ReplayDialog';
import { SendForm } from '../kafka/SendForm';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const profileView = (id: string, name: string, brokers: string): KafkaProfileView => ({
  id,
  name,
  brokers,
  topics: '',
  fromBeginning: false,
  groupId: '',
  ssl: false,
  saslMechanism: 'none',
  saslUsername: '',
  hasSaslPassword: false,
});
const local = profileView('p1', 'Local', 'localhost:9092');
const other = profileView('p2', 'Other', 'other:9092');

const kafkaMessage = (id: string): KafkaMessage => ({
  id,
  flowId: 'f',
  timestamp: Number(id),
  topic: 'orders',
  partition: 0,
  offset: id,
  key: `k${id}`,
  value: `v${id}`,
  headers: {},
});

const runningJob: KafkaJobProgress = {
  jobId: 'j1',
  kind: 'send',
  state: 'running',
  topic: 'orders',
  run: 1,
  sent: 2,
  failed: 0,
  total: 10,
  runs: 1,
  partitionCounts: {},
  errors: [],
  recent: [],
};

function renderSend(overrides: Partial<React.ComponentProps<typeof SendForm>> = {}) {
  const props = { draft: { ...EMPTY_SEND_DRAFT, topic: 'orders', value: 'hello' } as SendDraft, pending: false, onChange: vi.fn(), onSend: vi.fn(), ...overrides };
  render(<SendForm {...props} />);
  return props;
}

describe('SendForm additions', () => {
  it('sends the table headers with the draft', () => {
    const props = renderSend({ draft: { ...EMPTY_SEND_DRAFT, topic: 'orders', value: 'x', headers: '{"a":"b"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ topic: 'orders' }), { a: 'b' });
  });

  it('edits the draft from the table editor', () => {
    const props = renderSend();
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }));
    fireEvent.change(screen.getByLabelText('Header name 1'), { target: { value: 'x' } });
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.stringContaining('') }));
  });

  it('disables the value editor for tombstones', () => {
    renderSend({ draft: { ...EMPTY_SEND_DRAFT, topic: 'orders', tombstone: true } });
    expect((screen.getByLabelText('Message value') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/Tombstone: a null value is sent/)).toBeTruthy();
  });

  it('labels the button for multiple copies and repeat', () => {
    renderSend({ draft: { ...EMPTY_SEND_DRAFT, topic: 't', value: 'v', count: '5' } });
    expect(screen.getByRole('button', { name: 'Send 5 messages' })).toBeTruthy();
    cleanup();
    renderSend({ draft: { ...EMPTY_SEND_DRAFT, topic: 't', value: 'v', repeat: true } });
    expect(screen.getByRole('button', { name: 'Start repeating' })).toBeTruthy();
  });

  it('shows the read-only explanation and blocks sending', () => {
    const props = renderSend({ readOnlyReason: 'Connection "Prod" is read-only' });
    expect(screen.getByText(/"Prod" is read-only/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('shows progress and stops a running job', () => {
    const onStop = vi.fn();
    renderSend({ job: runningJob, onStop });
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    expect(onStop).toHaveBeenCalledWith('j1');
  });

  it('blocks invalid headers JSON', () => {
    const props = renderSend({ draft: { ...EMPTY_SEND_DRAFT, topic: 't', value: 'v', headers: '{' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(props.onSend).not.toHaveBeenCalled();
  });
});

describe('ReplayDialog', () => {
  const renderDialog = (overrides: Partial<React.ComponentProps<typeof ReplayDialog>> = {}) => {
    const props = {
      open: true,
      messages: [kafkaMessage('1'), kafkaMessage('2')],
      sourceProfile: local,
      profiles: [local, other],
      onOpenChange: vi.fn(),
      onReplay: vi.fn(),
      onStop: vi.fn(),
      ...overrides,
    };
    render(<ReplayDialog {...props} />);
    return props;
  };

  it('requires a target topic, then replays with the request', () => {
    const props = renderDialog();
    const replay = () => screen.getByRole('button', { name: /Replay 2 message/ }) as HTMLButtonElement;
    expect(replay().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Target topic'), { target: { value: 'orders-copy' } });
    expect(replay().disabled).toBe(false);
    fireEvent.click(replay());
    expect(props.onReplay).toHaveBeenCalledWith(
      expect.objectContaining({ targetTopic: 'orders-copy', targetProfile: expect.objectContaining({ id: 'p1' }), messages: props.messages, keepTimestamps: false }),
    );
  });

  it('lists a dry run preview', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Target topic'), { target: { value: 'copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dry run' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('needs an acknowledgement for the same topic on the same connection', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Target topic'), { target: { value: 'orders' } });
    expect(screen.getByText(/SAME topic/)).toBeTruthy();
    const replay = screen.getByRole('button', { name: /Replay 2 message/ }) as HTMLButtonElement;
    expect(replay.disabled).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: /I understand/ }));
    expect(replay.disabled).toBe(false);
  });

  it('blocks replay into a read-only connection', () => {
    renderDialog({ sourceProfile: { ...local, readOnly: true } });
    fireEvent.change(screen.getByLabelText('Target topic'), { target: { value: 'copy' } });
    expect((screen.getByRole('button', { name: /Replay 2 message/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/read-only/)).toBeTruthy();
  });
});
