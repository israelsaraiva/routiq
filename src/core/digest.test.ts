import { describe, expect, it } from 'vitest';
import { buildDigestAuthorization, digestUriFromUrl, formatNonceCount, parseDigestChallenge } from './digest';

const RFC2617_HEADER =
  'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';

describe('parseDigestChallenge', () => {
  it('parses quoted params and qop options', () => {
    expect(parseDigestChallenge(RFC2617_HEADER)).toEqual({
      realm: 'testrealm@host.com',
      nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
      opaque: '5ccc069c403ebaf9f0171e9517f40e41',
      algorithm: 'MD5',
      qopOptions: ['auth', 'auth-int'],
    });
  });

  it('finds the digest scheme among several and reads unquoted algorithm', () => {
    const challenge = parseDigestChallenge('Basic realm="x", Digest realm="r", nonce="n", algorithm=SHA-256');
    expect(challenge?.algorithm).toBe('SHA-256');
  });

  it('returns undefined for non-digest challenges', () => {
    expect(parseDigestChallenge('Basic realm="x"')).toBeUndefined();
  });
});

describe('buildDigestAuthorization', () => {
  it('matches the RFC 2617 example response', () => {
    const challenge = parseDigestChallenge(RFC2617_HEADER)!;
    const header = buildDigestAuthorization(
      challenge,
      { username: 'Mufasa', password: 'Circle Of Life' },
      { method: 'GET', uri: '/dir/index.html', cnonce: '0a4f113b', nonceCount: 1 },
    );
    expect(header).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(header).toContain('nc=00000001');
    expect(header).toContain('qop=auth');
    expect(header).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  });

  it('matches the RFC 7616 SHA-256 example response', () => {
    const challenge = parseDigestChallenge(
      'Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=SHA-256, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
    )!;
    const header = buildDigestAuthorization(
      challenge,
      { username: 'Mufasa', password: 'Circle of Life' },
      { method: 'GET', uri: '/dir/index.html', cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ', nonceCount: 1 },
    );
    expect(header).toContain('response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"');
  });

  it('omits qop fields when the server does not offer qop', () => {
    const challenge = parseDigestChallenge('Digest realm="r", nonce="n"')!;
    const header = buildDigestAuthorization(challenge, { username: 'u', password: 'p' }, { method: 'GET', uri: '/', cnonce: 'c', nonceCount: 1 });
    expect(header).not.toContain('qop=');
    expect(header).not.toContain('cnonce');
  });
});

describe('helpers', () => {
  it('formats nonce count as 8 hex digits', () => {
    expect(formatNonceCount(255)).toBe('000000ff');
  });

  it('derives the request uri with query', () => {
    expect(digestUriFromUrl('http://h:8080/a/b?x=1#frag')).toBe('/a/b?x=1');
  });
});
