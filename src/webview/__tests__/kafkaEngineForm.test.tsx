// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createKafkaProfile } from '../../core/kafka/profiles';
import { applyAuthPreset } from '../../core/kafka/authPresets';
import { KafkaProfileDraft } from '../../shared/types';

const postKafkaMessage = vi.fn();
vi.mock('../vscodeApi', () => ({ postKafkaMessage: (message: unknown) => postKafkaMessage(message) }));

import { AuthFields } from '../kafka/AuthFields';
import { ProtobufFields } from '../kafka/ProtobufFields';
import { StartPositionFields } from '../kafka/StartPositionFields';
import { TruncationNotice } from '../kafka/TruncationNotice';
import { VirtualList } from '../kafka/VirtualList';

const draft = (changes: Partial<KafkaProfileDraft> = {}): KafkaProfileDraft => ({ ...createKafkaProfile('p', () => 'id'), ...changes });

afterEach(() => {
  cleanup();
  postKafkaMessage.mockReset();
});

describe('StartPositionFields', () => {
  it('shows the input matching the start mode', () => {
    render(<StartPositionFields draft={draft({ startMode: 'offset' })} disabled={false} onChange={() => undefined} />);
    expect(screen.getByLabelText('Offsets (partition:offset, comma separated)')).toBeTruthy();
  });

  it('edits the last-N count', () => {
    const onChange = vi.fn();
    render(<StartPositionFields draft={draft({ startMode: 'lastN', startLastN: 5 })} disabled={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Messages per partition'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith({ startLastN: 25 });
  });
});

describe('AuthFields', () => {
  it('relabels the credentials for the Confluent Cloud preset', () => {
    render(<AuthFields draft={applyAuthPreset(draft(), 'confluent-cloud')} storedSecrets={[]} hasStoredPassword={false} onChange={() => undefined} />);
    expect(screen.getByLabelText('API key')).toBeTruthy();
    expect(screen.getByLabelText('API secret')).toBeTruthy();
  });

  it('writes secrets into the draft secrets, not the profile fields', () => {
    const onChange = vi.fn();
    render(<AuthFields draft={applyAuthPreset(draft(), 'oauth')} storedSecrets={['oauthToken']} hasStoredPassword={false} onChange={onChange} />);
    const token = screen.getByLabelText('Access token (or use token endpoint below)');
    expect(token.getAttribute('placeholder')).toBe('Stored in Secret Storage');
    fireEvent.change(token, { target: { value: 'abc' } });
    expect(onChange.mock.calls[0][0].secrets).toEqual({ oauthToken: 'abc' });
  });

  it('shows MSK IAM and mTLS fields', () => {
    render(<AuthFields draft={applyAuthPreset(draft(), 'aws-msk-iam')} storedSecrets={[]} hasStoredPassword={false} onChange={() => undefined} />);
    expect(screen.getByLabelText('AWS secret access key')).toBeTruthy();
    expect(screen.getByLabelText('Client certificate (path or PEM)')).toBeTruthy();
  });
});

describe('TruncationNotice', () => {
  it('requests the full message', () => {
    render(<TruncationNotice message={{ id: 'm1', valueTruncated: true, valueSize: 2048 } as never} />);
    fireEvent.click(screen.getByText('Show full'));
    expect(postKafkaMessage).toHaveBeenCalledWith({ type: 'kafkaRequestFullMessage', messageId: 'm1' });
  });

  it('renders nothing for complete values', () => {
    const { container } = render(<TruncationNotice message={{ id: 'm1' } as never} />);
    expect(container.textContent).toBe('');
  });
});

describe('VirtualList', () => {
  const items = Array.from({ length: 200 }, (_, index) => ({ id: String(index) }));

  it('renders every item below the threshold', () => {
    render(<VirtualList items={items.slice(0, 10)} getKey={(item) => item.id} renderItem={(item) => <p key={item.id}>row {item.id}</p>} />);
    expect(screen.getAllByText(/^row /)).toHaveLength(10);
  });

  it('windows large lists', () => {
    render(<VirtualList items={items} getKey={(item) => item.id} renderItem={(item) => <p key={item.id}>row {item.id}</p>} />);
    expect(screen.getAllByText(/^row /).length).toBeLessThan(items.length);
  });
});

describe('ProtobufFields', () => {
  it('asks the host for a .proto file and fills the path it returns', () => {
    const onChange = vi.fn();
    render(<ProtobufFields draft={draft()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    expect(postKafkaMessage).toHaveBeenCalledWith({ type: 'kafkaPickProtoFile' });
    fireEvent(window, new MessageEvent('message', { data: { type: 'kafkaProtoFilePicked', path: '/schemas/orders.proto' } }));
    expect(onChange).toHaveBeenCalledWith({ protobufFile: '/schemas/orders.proto' });
  });
});
