import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, ORIGIN, request, signIn, type TestContext } from './helpers.ts';

describe('SSO authentication', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('redirects to the provider on start', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/github/start' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://github.example.test/authorize?state=stub-state');
  });

  it('rejects unknown providers', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/facebook/start' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['google', 'github'] as const)('creates a local user and session on first %s sign-in', async (provider) => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/auth/${provider}/callback?code=valid-code&state=stub-state` });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${ORIGIN}/`);
    const sid = res.cookies.find((cookie) => cookie.name === 'sid');
    expect(sid).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const users = await ctx.prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      provider,
      providerUserId: ctx.providers.profiles[provider].providerUserId,
      email: ctx.providers.profiles[provider].email,
      displayName: ctx.providers.profiles[provider].displayName,
    });

    const me = await request(ctx, `sid=${sid!.value}`, { method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: users[0]!.id, provider, timezone: 'UTC' });
  });

  it('stores only a hash of the session token', async () => {
    const cookie = await signIn(ctx);
    const [session] = await ctx.prisma.session.findMany();
    expect(session!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie).not.toContain(session!.tokenHash);
  });

  it('reuses the user on repeat sign-in and refreshes the profile', async () => {
    await signIn(ctx, 'google');
    await signIn(ctx, 'google', { displayName: 'Alice Renamed' });
    const users = await ctx.prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]!.displayName).toBe('Alice Renamed');
  });

  it('keeps Google and GitHub identities separate even with the same email', async () => {
    await signIn(ctx, 'google', { email: 'same@example.test' });
    await signIn(ctx, 'github', { email: 'same@example.test' });
    expect(await ctx.prisma.user.count()).toBe(2);
  });

  it('stores a null email when GitHub provides none', async () => {
    await signIn(ctx, 'github');
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { provider: 'github' } });
    expect(user.email).toBeNull();
  });

  it('redirects to /login when the provider exchange fails', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/google/callback?code=bad&state=stub-state' });
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=sso_failed`);
    expect(res.cookies.find((cookie) => cookie.name === 'sid')).toBeUndefined();
    expect(await ctx.prisma.user.count()).toBe(0);
  });

  it('reports a cancelled consent screen', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/github/callback?error=access_denied' });
    expect(res.headers.location).toBe(`${ORIGIN}/login?error=access_denied`);
  });

  it('returns 401 without a valid session', async () => {
    const none = await request(ctx, null, { method: 'GET', url: '/api/auth/me' });
    expect(none.statusCode).toBe(401);
    expect(none.json().error.code).toBe('UNAUTHENTICATED');
    const forged = await request(ctx, 'sid=forged.value', { method: 'GET', url: '/api/auth/me' });
    expect(forged.statusCode).toBe(401);
  });

  it('rejects an expired session', async () => {
    const cookie = await signIn(ctx);
    ctx.clock.set('2026-11-20T12:00:00.000Z');
    const res = await request(ctx, cookie, { method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(await ctx.prisma.session.count()).toBe(0);
  });

  it('logs out and invalidates the session', async () => {
    const cookie = await signIn(ctx);
    const res = await request(ctx, cookie, { method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    const me = await request(ctx, cookie, { method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
  });

  it('rejects state-changing requests from another origin', async () => {
    const cookie = await signIn(ctx);
    const res = await request(ctx, cookie, { method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://evil.example.test' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN_ORIGIN');
    const noOrigin = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(noOrigin.statusCode).toBe(403);
  });

  it('updates the timezone and rejects unknown zones', async () => {
    const cookie = await signIn(ctx);
    const ok = await request(ctx, cookie, { method: 'PUT', url: '/api/me/timezone', payload: { timezone: 'Europe/Kyiv' } });
    expect(ok.statusCode).toBe(204);
    const me = await request(ctx, cookie, { method: 'GET', url: '/api/auth/me' });
    expect(me.json().timezone).toBe('Europe/Kyiv');

    const bad = await request(ctx, cookie, { method: 'PUT', url: '/api/me/timezone', payload: { timezone: 'Mars/Olympus' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Unknown timezone' });
  });
});
