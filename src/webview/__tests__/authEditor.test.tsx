// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Auth } from '../../shared/types';
import { createRequest } from '../../core/factories';

vi.mock('../vscodeApi', () => ({ postToHost: vi.fn() }));

import { RequestTabContent } from '../RequestTabs';

function renderAuth(auth: Auth) {
  const onChange = vi.fn();
  render(<RequestTabContent tab="auth" request={{ ...createRequest('r', () => 'r'), auth }} onChange={onChange} />);
  return onChange;
}

afterEach(cleanup);

describe('auth editor', () => {
  it('edits AWS Signature v4 fields', () => {
    const auth: Auth = { type: 'awsv4', accessKey: '', secretKey: '', sessionToken: '', region: '', service: '' };
    const onChange = renderAuth(auth);
    fireEvent.change(screen.getByLabelText('Region (e.g. eu-west-1)'), { target: { value: 'eu-west-1' } });
    expect(onChange).toHaveBeenCalledWith({ auth: { ...auth, region: 'eu-west-1' } });
    expect(screen.getByLabelText('Service (e.g. execute-api)')).toBeTruthy();
  });

  it('shows authorization URL, redirect URL and PKCE only for the authorization code grant', () => {
    const base: Auth = { type: 'oauth2', grant: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', username: '', password: '' };
    renderAuth({ ...base, grant: 'authorization_code', authUrl: '', redirectUrl: '', usePkce: false });
    expect(screen.getByLabelText('Authorization URL')).toBeTruthy();
    expect(screen.getByLabelText('Redirect URL (optional, http://localhost:PORT/path)')).toBeTruthy();
    expect(screen.getByText('Use PKCE (S256)')).toBeTruthy();
    cleanup();
    renderAuth(base);
    expect(screen.queryByLabelText('Authorization URL')).toBeNull();
  });
});
