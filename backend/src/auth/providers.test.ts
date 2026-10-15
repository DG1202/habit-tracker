import { describe, expect, it } from 'vitest';
import { mapGithubProfile, mapGoogleProfile } from './providers.ts';

describe('mapGoogleProfile', () => {
  it('maps a verified Google profile', () => {
    expect(
      mapGoogleProfile({ sub: '123', email: 'alice@example.test', email_verified: true, name: 'Alice Test', picture: 'https://example.test/a.png' }),
    ).toEqual({ providerUserId: '123', email: 'alice@example.test', displayName: 'Alice Test', avatarUrl: 'https://example.test/a.png' });
  });

  it('drops unverified emails and non-https avatars', () => {
    expect(mapGoogleProfile({ sub: '123', email: 'x@example.test', email_verified: false, picture: 'http://example.test/a.png' })).toEqual({
      providerUserId: '123',
      email: null,
      displayName: 'Google user',
      avatarUrl: null,
    });
  });

  it('rejects a profile without a subject', () => {
    expect(() => mapGoogleProfile({ email: 'x@example.test' })).toThrow();
  });
});

describe('mapGithubProfile', () => {
  const user = { id: 42, login: 'octo-test', name: null, avatar_url: 'https://example.test/o.png' };

  it('uses the primary verified email', () => {
    const emails = [
      { email: 'other@example.test', primary: false, verified: true },
      { email: 'octo@example.test', primary: true, verified: true },
    ];
    expect(mapGithubProfile(user, emails)).toEqual({
      providerUserId: '42',
      email: 'octo@example.test',
      displayName: 'octo-test',
      avatarUrl: 'https://example.test/o.png',
    });
  });

  it('stores no email when GitHub returns none or the call failed', () => {
    expect(mapGithubProfile(user, []).email).toBeNull();
    expect(mapGithubProfile(user, null).email).toBeNull();
    expect(mapGithubProfile(user, [{ email: 'x@example.test', primary: true, verified: false }]).email).toBeNull();
  });
});
