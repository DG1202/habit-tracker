import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { createTestContext, TEST_CONFIG, type TestContext } from './helpers.ts';

describe('app basics', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('answers health checks', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns the JSON error shape for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } });
  });
});

describe('loadConfig', () => {
  const valid = Object.fromEntries(Object.entries(TEST_CONFIG).map(([key, value]) => [key, String(value)]));

  it('parses a valid environment', () => {
    expect(loadConfig({ ...valid, APP_ORIGIN: 'http://localhost:4300/' }).APP_ORIGIN).toBe('http://localhost:4300');
  });

  it.each(['https://habits.example.test', 'https://habits.example.test:8443/'])('accepts the https origin %s', (origin) => {
    expect(loadConfig({ ...valid, APP_ORIGIN: origin }).APP_ORIGIN).toBe(new URL(origin).origin);
  });

  it.each([
    'file:///tmp/x',
    'data:text/plain,hi',
    'ftp://example.test',
    'ws://localhost:4300',
    'http://localhost:4300/app',
    'http://localhost:4300/?next=1',
    'http://localhost:4300/#top',
  ])('rejects APP_ORIGIN=%s', (origin) => {
    expect(() => loadConfig({ ...valid, APP_ORIGIN: origin })).toThrow('Invalid or missing environment variables: APP_ORIGIN');
  });

  it('names missing variables without echoing values', () => {
    const { GITHUB_CLIENT_SECRET: _omit, ...rest } = valid;
    expect(() => loadConfig({ ...rest, SESSION_SECRET: 'short' })).toThrow(
      'Invalid or missing environment variables: SESSION_SECRET, GITHUB_CLIENT_SECRET',
    );
  });
});
