import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ProviderName } from '../src/auth/providers.ts';
import { createTestContext, ORIGIN, type TestContext } from './helpers.ts';

const STATE_COOKIE = '__Host-oauth2-redirect-state';
const VERIFIER_COOKIE = '__Host-oauth2-code-verifier';
// The runtime namespace exposes the simple-oauth2 client that @fastify/oauth2's typings omit.
type TokenClient = { oauth2: { getToken(params: object): Promise<unknown> } };

const AUTHORIZE_HOSTS: Record<ProviderName, string> = { google: 'accounts.google.com', github: 'github.com' };

describe.each(['google', 'github'] as const)('real %s OAuth state and PKCE handling', (provider) => {
  let ctx: TestContext;
  let getToken: MockInstance;

  beforeEach(async () => {
    ctx = await createTestContext(undefined, { realOAuth: true });
    // Every token-endpoint call is intercepted here, so no test can reach the network.
    getToken = vi.spyOn((ctx.app[`${provider}OAuth2`] as unknown as TokenClient).oauth2, 'getToken').mockRejectedValue(new Error('token endpoint intercepted'));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  async function start() {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/auth/${provider}/start` });
    const location = new URL(String(res.headers.location));
    const state = res.cookies.find((cookie) => cookie.name === STATE_COOKIE);
    const verifier = res.cookies.find((cookie) => cookie.name === VERIFIER_COOKIE);
    return { res, location, state, verifier, cookie: `${STATE_COOKIE}=${state?.value}; ${VERIFIER_COOKIE}=${verifier?.value}` };
  }

  async function expectRejected(url: string, cookie?: string) {
    const res = await ctx.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=sso_failed`);
    expect(res.cookies.find((c) => c.name === 'sid')).toBeUndefined();
    expect(getToken).not.toHaveBeenCalled();
    expect(await ctx.prisma.session.count()).toBe(0);
    expect(await ctx.prisma.user.count()).toBe(0);
  }

  it('redirects with state and an S256 code challenge and sets the state and verifier cookies', async () => {
    const { res, location, state, verifier } = await start();

    expect(res.statusCode).toBe(302);
    expect(location.host).toBe(AUTHORIZE_HOSTS[provider]);
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/${provider}/callback`);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(state).toMatchObject({ value: location.searchParams.get('state'), httpOnly: true, secure: true, path: '/', sameSite: 'Lax' });
    expect(verifier).toMatchObject({ httpOnly: true, secure: true, path: '/', sameSite: 'Lax' });
    const challenge = createHash('sha256').update(verifier!.value).digest('base64url');
    expect(location.searchParams.get('code_challenge')).toBe(challenge);
  });

  it('issues a fresh state and verifier on every start', async () => {
    const first = await start();
    const second = await start();
    expect(second.state!.value).not.toBe(first.state!.value);
    expect(second.verifier!.value).not.toBe(first.verifier!.value);
  });

  it('rejects a callback without a state parameter', async () => {
    const { cookie } = await start();
    await expectRejected(`/api/auth/${provider}/callback?code=some-code`, cookie);
  });

  it('rejects a callback whose state does not match the state cookie', async () => {
    const { cookie } = await start();
    await expectRejected(`/api/auth/${provider}/callback?code=some-code&state=attacker-chosen-state`, cookie);
  });

  it('rejects a callback that carries the right state but no state cookie', async () => {
    const { location } = await start();
    await expectRejected(`/api/auth/${provider}/callback?code=some-code&state=${location.searchParams.get('state')}`);
  });

  it('sends the PKCE verifier to the token endpoint only after the state matches', async () => {
    const { location, verifier, cookie } = await start();
    const state = location.searchParams.get('state')!;

    const res = await ctx.app.inject({ method: 'GET', url: `/api/auth/${provider}/callback?code=some-code&state=${state}`, headers: { cookie } });

    expect(getToken).toHaveBeenCalledOnce();
    expect(getToken.mock.calls[0]![0]).toMatchObject({
      code: 'some-code',
      code_verifier: verifier!.value,
      redirect_uri: `${ORIGIN}/api/auth/${provider}/callback`,
    });
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=sso_failed`);
    expect(res.cookies.find((c) => c.name === 'sid')).toBeUndefined();
    expect(res.cookies.filter((c) => c.name === STATE_COOKIE || c.name === VERIFIER_COOKIE).map((c) => c.value)).toEqual(['', '']);
    expect(await ctx.prisma.session.count()).toBe(0);
  });
});
