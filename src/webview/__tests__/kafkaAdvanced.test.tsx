// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createKafkaProfile } from '../../core/kafka/profiles';
import { KafkaProfileDraft, KafkaStatus } from '../../shared/types';

vi.mock('../vscodeApi', () => ({ postKafkaMessage: vi.fn() }));

import { ConnectionForm } from '../kafka/ConnectionForm';

const draft = (changes: Partial<KafkaProfileDraft> = {}): KafkaProfileDraft => ({ ...createKafkaProfile('p', () => 'id'), ...changes });

function renderForm(profile: KafkaProfileDraft, status: KafkaStatus = { state: 'disconnected' }) {
  return render(
    <ConnectionForm
      draft={profile}
      profiles={[]}
      collections={[]}
      status={status}
      hasStoredPassword={false}
      onChange={() => undefined}
      onSelectProfile={() => undefined}
      onSave={() => undefined}
      onDelete={() => undefined}
    />,
  );
}

const toggle = () => screen.getByRole('button', { name: /Advanced/ });

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
  });
});
afterEach(cleanup);

describe('ConnectionForm advanced section', () => {
  it('keeps essentials visible and hides the rest by default', () => {
    renderForm(draft());
    expect(screen.getByLabelText('Broker(s)')).toBeTruthy();
    expect(screen.getByLabelText('Topics (comma separated)')).toBeTruthy();
    expect(screen.getByLabelText('Consumer group (optional)')).toBeTruthy();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Schema Registry URL (optional)')).toBeNull();
    expect(screen.queryByText('Read-only (never produce)')).toBeNull();
  });

  it('toggles and remembers the open state', () => {
    const { unmount } = renderForm(draft());
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Schema Registry URL (optional)')).toBeTruthy();
    unmount();
    renderForm(draft());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('shows a badge only when an advanced field has a value', () => {
    const { unmount } = renderForm(draft());
    expect(screen.queryByLabelText('Advanced settings configured')).toBeNull();
    unmount();
    renderForm(draft({ schemaRegistryUrl: 'http://localhost:8081' }));
    expect(screen.getByLabelText('Advanced settings configured')).toBeTruthy();
  });

  it('auto-expands for profiles using SASL or SSL', () => {
    renderForm(draft({ saslMechanism: 'plain' }));
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('auto-expands when the error concerns an advanced field', () => {
    const { rerender } = renderForm(draft());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    rerender(
      <ConnectionForm
        draft={draft()}
        profiles={[]}
        collections={[]}
        status={{ state: 'error', detail: 'TLS error: bad certificate' }}
        hasStoredPassword={false}
        onChange={() => undefined}
        onSelectProfile={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
});
