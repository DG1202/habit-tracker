import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, loggerOptions } from '../src/app.ts';
import { createShutdown } from '../src/lib/shutdown.ts';
import { createTestContext, TEST_CONFIG, type TestContext } from './helpers.ts';

describe('log redaction', () => {
  let ctx: TestContext;
  let output: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    ctx = await createTestContext();
    output = '';
    const stream = { write: (message: string) => void (output += message) };
    app = await buildApp({
      config: TEST_CONFIG,
      prisma: ctx.prisma,
      clock: ctx.clock,
      providers: ctx.providers.clients,
      logger: loggerOptions(TEST_CONFIG, stream),
    });
    app.get('/api/test-boom', async () => {
      throw new Error('database failure for leak@example.test');
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    await ctx.close();
  });

  it('never logs OAuth code or state from the callback URL', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=SECRETCODE&state=SECRETSTATE' });
    expect(res.statusCode).toBe(302);
    expect(output).toContain('SSO callback failed');
    expect(output).not.toContain('SECRETCODE');
    expect(output).not.toContain('SECRETSTATE');
  });

  it('never logs cookies', async () => {
    await app.inject({ method: 'GET', url: '/api/health', headers: { cookie: 'sid=SECRETCOOKIE' } });
    expect(output).toContain('request completed');
    expect(output).not.toContain('SECRETCOOKIE');
  });

  it('never logs the message of an unhandled error', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/test-boom' });
    expect(res.statusCode).toBe(500);
    expect(output).toContain('Unhandled error');
    expect(output).not.toContain('leak@example.test');
  });

  it('never logs the message of a failed database disconnect at shutdown', async () => {
    const prisma = { $disconnect: async () => { throw new Error('disconnect failed for file:/leak/path.db'); } };
    let exitCode: number | null = null;
    await createShutdown(app, prisma, (code) => void (exitCode = code))();
    expect(exitCode).toBe(1);
    expect(output).toContain('Database disconnect failed');
    expect(output).not.toContain('/leak/path.db');
  });
});
