// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AboutInfo } from '../../core/infoMessages';

const postInfoMessage = vi.fn();
vi.mock('../vscodeApi', () => ({ postInfoMessage: (message: unknown) => postInfoMessage(message) }));

import { AboutView } from '../AboutView';
import { HelpView } from '../HelpView';

const about: AboutInfo = {
  name: 'routiq',
  displayName: 'Routiq',
  version: '9.8.7',
  publisher: 'acme',
  authorName: 'Ada Lovelace',
  authorEmail: 'ada@example.com',
  license: 'MIT',
  description: 'A REST client',
  vscodeVersion: '1.90.0',
  nodeVersion: '20.0.0',
  electronVersion: '29.0.0',
  storageDirectory: '/work/.routiq',
  revealLabel: 'Reveal in Finder',
  collectionCount: 3,
  requestCount: 12,
};

function loadInfo(links = [{ label: 'Report an issue', url: 'https://example.com/issues' }]): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'infoLoad', about, links } }));
  });
}

beforeEach(() => postInfoMessage.mockClear());
afterEach(cleanup);

describe('HelpView', () => {
  it('lists the sections and asks the host for links', () => {
    render(<HelpView />);
    expect(screen.getByText('Getting started')).toBeTruthy();
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy();
    expect(postInfoMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('filters sections by the search text and expands matches', () => {
    render(<HelpView />);
    fireEvent.change(screen.getByLabelText('Search help'), { target: { value: 'uuid' } });
    expect(screen.queryByText('Getting started')).toBeNull();
    expect(screen.getByText('Dynamic variables')).toBeTruthy();
    expect(screen.getByText(/random UUID/)).toBeTruthy();
  });

  it('shows an empty state when nothing matches', () => {
    render(<HelpView />);
    fireEvent.change(screen.getByLabelText('Search help'), { target: { value: 'qqqqzzzz' } });
    expect(screen.getByText(/No help topics match/)).toBeTruthy();
  });

  it('posts host actions and renders manifest links', () => {
    render(<HelpView />);
    loadInfo();
    fireEvent.click(screen.getAllByText('Open settings')[0]);
    fireEvent.click(screen.getByText('Report an issue'));
    expect(postInfoMessage).toHaveBeenCalledWith({ type: 'openSettings' });
    expect(postInfoMessage).toHaveBeenCalledWith({ type: 'openLink', url: 'https://example.com/issues' });
  });
});

describe('AboutView', () => {
  it('renders nothing until the host sends the info', () => {
    const { container } = render(<AboutView />);
    expect(container.textContent).toBe('');
  });

  it('shows versions, storage and counts and posts storage actions', () => {
    render(<AboutView />);
    loadInfo([]);
    expect(screen.getByText('9.8.7')).toBeTruthy();
    expect(screen.getByText('/work/.routiq')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    fireEvent.click(screen.getByText('Reveal in Finder'));
    fireEvent.click(screen.getByText('Copy path'));
    fireEvent.click(screen.getByText('Copy diagnostics'));
    const types = postInfoMessage.mock.calls.map(([message]) => message.type);
    expect(types).toEqual(expect.arrayContaining(['revealStorage', 'copyStoragePath', 'copyDiagnostics']));
  });

  it('credits the author, offers contact and falls back when no license is set', () => {
    render(<AboutView />);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'infoLoad', about: { ...about, license: '' }, links: [] } }));
    });
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Not specified')).toBeTruthy();
    expect(screen.getByText(`© ${new Date().getFullYear()} Ada Lovelace`)).toBeTruthy();
    fireEvent.click(screen.getByText('Contact / Send feedback'));
    fireEvent.click(screen.getByText('ada@example.com'));
    expect(postInfoMessage.mock.calls.filter(([message]) => message.type === 'contactAuthor')).toHaveLength(2);
  });

  it('credits the main libraries', () => {
    render(<AboutView />);
    loadInfo([]);
    expect(screen.getByText('React')).toBeTruthy();
    expect(screen.getByText('Radix UI')).toBeTruthy();
  });
});
