import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHabitWithStreak, createTestContext, request, signIn, userIdOf, type TestContext } from './helpers.ts';

describe('habits API', () => {
  let ctx: TestContext;
  let alice: string;
  let bob: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    alice = await signIn(ctx, 'google');
    bob = await signIn(ctx, 'github');
  });
  afterEach(async () => {
    await ctx.close();
  });

  const create = (cookie: string, payload: object) => request(ctx, cookie, { method: 'POST', url: '/api/habits', payload });

  it('creates an active habit with zero stats', async () => {
    const res = await create(alice, { name: '  Read 20 pages  ', description: 'Before bed', startDate: '2026-10-01' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'Read 20 pages',
      description: 'Before bed',
      startDate: '2026-10-01',
      status: 'ACTIVE',
      stats: { currentStreak: 0, bestStreak: 0, totalCheckIns: 0, checkedInToday: false },
    });
  });

  it.each([
    [{ name: '   ', startDate: '2026-10-01' }, 'name', 'Name is required'],
    [{ name: 'x'.repeat(81), startDate: '2026-10-01' }, 'name', 'Name must be at most 80 characters'],
    [{ name: 'Run', description: 'x'.repeat(501), startDate: '2026-10-01' }, 'description', 'Description must be at most 500 characters'],
    [{ name: 'Run', startDate: '2026-02-30' }, 'startDate', 'Start date must be a valid date (YYYY-MM-DD)'],
  ])('rejects invalid input %j', async (payload, path, message) => {
    const res = await create(alice, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details).toContainEqual({ path, message });
  });

  it('rejects unknown fields, malformed JSON and non-JSON bodies with 4xx JSON errors', async () => {
    expect((await create(alice, { name: 'Run', startDate: '2026-10-01', userId: 'someone-else' })).statusCode).toBe(400);

    const malformed = await request(ctx, alice, {
      method: 'POST',
      url: '/api/habits',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('BAD_REQUEST');

    const textPlain = await request(ctx, alice, {
      method: 'POST',
      url: '/api/habits',
      headers: { 'content-type': 'text/plain' },
      payload: 'name=Run',
    });
    expect(textPlain.statusCode).toBe(415);
    expect(textPlain.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/habits' });
    expect(res.statusCode).toBe(401);
  });

  it('answers 401 before looking at the body of an unauthenticated request', async () => {
    for (const [contentType, payload] of [
      ['application/json', '{"name":'],
      ['text/plain', 'name=Run'],
    ]) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/habits',
        headers: { origin: 'http://localhost:4300', 'content-type': contentType! },
        payload,
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('isolates habits per user', async () => {
    const habit = (await create(alice, { name: 'Alice habit', startDate: '2026-10-01' })).json();

    const bobList = await request(ctx, bob, { method: 'GET', url: '/api/habits' });
    expect(bobList.json()).toEqual([]);

    for (const [method, payload] of [['GET'], ['PATCH', { name: 'Hacked' }], ['DELETE']] as const) {
      const res = await request(ctx, bob, { method, url: `/api/habits/${habit.id}`, payload });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    const still = await request(ctx, alice, { method: 'GET', url: `/api/habits/${habit.id}` });
    expect(still.json().name).toBe('Alice habit');
  });

  it('edits fields and moves between Active and Paused', async () => {
    const habit = (await create(alice, { name: 'Run', startDate: '2026-10-01' })).json();
    const edited = await request(ctx, alice, {
      method: 'PATCH',
      url: `/api/habits/${habit.id}`,
      payload: { name: 'Run 5k', description: 'Morning', startDate: '2026-10-02', status: 'PAUSED' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ name: 'Run 5k', description: 'Morning', startDate: '2026-10-02', status: 'PAUSED' });

    const resumed = await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { status: 'ACTIVE' } });
    expect(resumed.json().status).toBe('ACTIVE');
  });

  it('makes archived habits read-only', async () => {
    const habit = (await create(alice, { name: 'Run', startDate: '2026-10-01' })).json();
    await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { status: 'ARCHIVED' } });

    for (const payload of [{ name: 'New name' }, { status: 'ACTIVE' }]) {
      const res = await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('HABIT_ARCHIVED');
    }
  });

  it('moves the start date earlier, and through Paused to Archived', async () => {
    const userId = await userIdOf(ctx, alice);
    const habit = await createHabitWithStreak(ctx, userId, { days: 3, endingOn: '2026-10-15' });
    const earlier = await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { startDate: '2026-01-01' } });
    expect(earlier.json()).toMatchObject({ startDate: '2026-01-01', stats: { currentStreak: 3 } });

    await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { status: 'PAUSED' } });
    const archived = await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { status: 'ARCHIVED' } });
    expect(archived.json().status).toBe('ARCHIVED');
  });

  it("does not let another user delete someone else's archived habit", async () => {
    const userId = await userIdOf(ctx, alice);
    const habit = await createHabitWithStreak(ctx, userId, { days: 3, endingOn: '2026-10-15', status: 'ARCHIVED' });
    const res = await request(ctx, bob, { method: 'DELETE', url: `/api/habits/${habit.id}` });
    expect(res.statusCode).toBe(404);
    expect(await ctx.prisma.checkIn.count({ where: { habitId: habit.id } })).toBe(3);
  });

  it("filters by today in the user's time zone", async () => {
    ctx.clock.set('2026-10-15T22:30:00.000Z');
    const userId = await userIdOf(ctx, alice);
    await createHabitWithStreak(ctx, userId, { days: 1, endingOn: '2026-10-16', name: 'Kyiv today' });
    await request(ctx, alice, { method: 'PUT', url: '/api/me/timezone', payload: { timezone: 'Europe/Kyiv' } });
    const done = await request(ctx, alice, { method: 'GET', url: '/api/habits?today=done' });
    expect(done.json().map((h: { name: string }) => h.name)).toEqual(['Kyiv today']);
  });

  it('refuses to move the start date after the first check-in', async () => {
    const userId = await userIdOf(ctx, alice);
    const habit = await createHabitWithStreak(ctx, userId, { days: 3, endingOn: '2026-10-15' });
    const res = await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { startDate: '2026-10-14' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('START_DATE_AFTER_CHECKINS');
  });

  it('deletes only archived habits and removes their history', async () => {
    const userId = await userIdOf(ctx, alice);
    const habit = await createHabitWithStreak(ctx, userId, { days: 3, endingOn: '2026-10-15' });
    await ctx.prisma.milestoneNotification.create({ data: { habitId: habit.id, milestone: 3 } });

    const blocked = await request(ctx, alice, { method: 'DELETE', url: `/api/habits/${habit.id}` });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('HABIT_NOT_ARCHIVED');

    await request(ctx, alice, { method: 'PATCH', url: `/api/habits/${habit.id}`, payload: { status: 'ARCHIVED' } });
    const deleted = await request(ctx, alice, { method: 'DELETE', url: `/api/habits/${habit.id}` });
    expect(deleted.statusCode).toBe(204);
    expect(await ctx.prisma.habit.count()).toBe(0);
    expect(await ctx.prisma.checkIn.count()).toBe(0);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(0);
  });

  it('searches name and description case-insensitively and filters by status and today', async () => {
    const userId = await userIdOf(ctx, alice);
    await createHabitWithStreak(ctx, userId, { days: 1, endingOn: '2026-10-15', name: 'Morning Run' });
    const notDone = await ctx.prisma.habit.create({
      data: { userId, name: 'Meditate', description: 'Ten minutes of RUNNING thoughts', startDate: '2026-10-01' },
    });
    await ctx.prisma.habit.create({ data: { userId, name: 'Guitar', startDate: '2026-10-01', status: 'PAUSED' } });

    const names = async (query: string) =>
      (await request(ctx, alice, { method: 'GET', url: `/api/habits${query}` })).json().map((h: { name: string }) => h.name).sort();

    expect(await names('?q=run')).toEqual(['Meditate', 'Morning Run']);
    expect(await names('?status=PAUSED')).toEqual(['Guitar']);
    expect(await names('?today=done')).toEqual(['Morning Run']);
    expect(await names('?today=not_done')).toEqual([notDone.name]);
    expect(await names('?q=zzz')).toEqual([]);
    expect(await names('?q=meditate%0Aten')).toEqual([]);

    const bad = await request(ctx, alice, { method: 'GET', url: '/api/habits?status=DONE' });
    expect(bad.statusCode).toBe(400);
  });
});
