import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.ts';

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
