import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, loggerOptions } from '../src/app.ts';
import { createShutdown } from '../src/lib/shutdown.ts';
import { createTestContext, DEFAULT_PROFILES, ORIGIN, TEST_CONFIG, type TestContext } from './helpers.ts';

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

  it('records sign-in, sign-out and the user of authenticated requests without secrets or PII', async () => {
    const callback = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=valid-code&state=stub-state' });
    const sid = callback.cookies.find((c) => c.name === 'sid')!.value;
    const cookie = `sid=${sid}`;
    const userId = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json<{ id: string }>().id;
    await app.inject({ method: 'GET', url: '/api/habits', headers: { cookie } });
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, origin: ORIGIN } });
    expect(logout.statusCode).toBe(204);

    const lines = output.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.find((line) => line.msg === 'Signed in')).toMatchObject({ userId, provider: 'google' });
    expect(lines.find((line) => line.msg === 'Signed out')).toMatchObject({ userId });
    const habitsReqId = lines.find((line) => line.msg === 'incoming request' && (line.req as { url: string }).url === '/api/habits')?.reqId;
    expect(lines.find((line) => line.msg === 'request completed' && line.reqId === habitsReqId)).toMatchObject({ userId });
    const { email, displayName, avatarUrl } = DEFAULT_PROFILES.google;
    for (const secret of [sid, sid.split('.')[0]!, 'valid-code', 'stub-state', email!, displayName, avatarUrl!]) {
      expect(output).not.toContain(secret);
    }
  });

  it('attributes a sign-in over another user\'s session to the new user only', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=valid-code&state=stub-state' });
    const cookie = `sid=${first.cookies.find((c) => c.name === 'sid')!.value}`;
    const second = await app.inject({ method: 'GET', url: '/api/auth/github/callback?code=valid-code&state=stub-state', headers: { cookie } });
    const bob = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `sid=${second.cookies.find((c) => c.name === 'sid')!.value}` } })).json<{ id: string }>().id;

    const signedIn = output.split('\n').filter((line) => line.includes('"Signed in"'));
    expect(signedIn).toHaveLength(2);
    expect(signedIn[1]!.match(/"userId"/g)).toHaveLength(1);
    expect(JSON.parse(signedIn[1]!)).toMatchObject({ userId: bob, provider: 'github' });
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
