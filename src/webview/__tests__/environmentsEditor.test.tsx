// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EnvironmentsDraft } from '../../shared/types';

const postToHost = vi.fn();
vi.mock('../vscodeApi', () => ({ postToHost: (message: unknown) => postToHost(message) }));

import { EnvironmentsEditor } from '../EnvironmentsEditor';

const draft: EnvironmentsDraft = {
  variables: [],
  activeEnvironmentId: 'e1',
  environments: [{ id: 'e1', name: 'Production', variables: [{ key: 'token', value: 'abc', enabled: true, secret: true }] }],
};

function loadDraft(): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'environmentsLoad', collectionName: 'Demo', draft } }));
  });
}

beforeEach(() => postToHost.mockClear());
afterEach(cleanup);

describe('EnvironmentsEditor', () => {
  it('shows the empty state for base variables and adds a row', () => {
    render(<EnvironmentsEditor />);
    loadDraft();
    expect(screen.getByText('No variables yet')).toBeTruthy();
    fireEvent.click(screen.getByText('Add variable'));
    expect(screen.getAllByPlaceholderText('Variable')).toHaveLength(1);
    expect((screen.getByText('Save').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks the active environment, adds a row on Enter and discards changes', () => {
    render(<EnvironmentsEditor />);
    loadDraft();
    fireEvent.click(screen.getByText('Production'));
    expect(screen.getByText('Active')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Variable name'), { key: 'Enter' });
    expect(screen.getAllByLabelText('Variable name')).toHaveLength(2);

    fireEvent.click(screen.getByText('Discard'));
    expect(screen.getAllByLabelText('Variable name')).toHaveLength(1);
  });

  it('posts the draft on save', () => {
    render(<EnvironmentsEditor />);
    loadDraft();
    fireEvent.click(screen.getByText('Add environment'));
    fireEvent.click(screen.getByText('Save'));
    const saved = postToHost.mock.calls.map(([message]) => message).find((message) => message.type === 'saveEnvironments');
    expect(saved.environments).toHaveLength(2);
  });
});
