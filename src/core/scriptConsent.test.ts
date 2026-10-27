import { describe, expect, it } from 'vitest';
import { createRequest } from './factories';
import { decideScriptExecution, isCollectionApproved, requestHasScripts, withApproval } from './scriptConsent';

describe('script consent decisions', () => {
  it('blocks in an untrusted workspace even when approved', () => {
    expect(decideScriptExecution({ workspaceTrusted: false, approved: true })).toMatchObject({ allowed: false });
  });

  it('asks when trusted but not yet approved', () => {
    expect(decideScriptExecution({ workspaceTrusted: true, approved: false })).toBe('ask');
  });

  it('allows when trusted and approved', () => {
    expect(decideScriptExecution({ workspaceTrusted: true, approved: true })).toEqual({ allowed: true });
  });
});

describe('script approvals', () => {
  it('adds a collection once', () => {
    const once = withApproval(['a'], 'b');
    expect(withApproval(once, 'b')).toEqual(['a', 'b']);
    expect(isCollectionApproved(once, 'b')).toBe(true);
    expect(isCollectionApproved(once, 'c')).toBe(false);
  });

  it('detects requests with non-blank scripts', () => {
    const request = createRequest('r');
    expect(requestHasScripts(request)).toBe(false);
    expect(requestHasScripts({ ...request, scripts: { pre: '  ', post: 'rq.test("x", () => {})' } })).toBe(true);
  });
});
