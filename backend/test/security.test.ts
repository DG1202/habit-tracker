import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createTestContext, ORIGIN, TEST_CONFIG, type TestContext } from './helpers.ts';

describe('security hardening', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('sets security headers on API responses', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('rate-limits the auth endpoints', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await ctx.app.inject({ method: 'GET', url: '/api/auth/github/start' })).statusCode);
    }
    expect(codes.slice(0, 20).every((code) => code === 302)).toBe(true);
    const limited = await ctx.app.inject({ method: 'GET', url: '/api/auth/github/start' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
  });

  it.each([
    ['GET', '/api/auth/github/callback?code=bad&state=stub-state'],
    ['POST', '/api/auth/logout'],
  ])('rate-limits %s %s at 20 per minute', async (method, url) => {
    const send = () => ctx.app.inject({ method: method as 'GET' | 'POST', url, headers: { origin: ORIGIN } });
    for (let i = 0; i < 20; i++) expect((await send()).statusCode).not.toBe(429);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
  });

  it('marks the session cookie Secure in production', async () => {
    const app = await buildApp({
      config: { ...TEST_CONFIG, NODE_ENV: 'production' },
      prisma: ctx.prisma,
      clock: ctx.clock,
      providers: ctx.providers.clients,
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=valid-code&state=stub-state' });
    await app.close();
    expect(res.cookies.find((cookie) => cookie.name === 'sid')).toMatchObject({ secure: true, httpOnly: true });
  });

  it('rejects oversized bodies', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/habits',
      headers: { origin: 'http://localhost:4300', 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x'.repeat(20_000) }),
    });
    expect(res.statusCode).toBe(413);
  });
});
