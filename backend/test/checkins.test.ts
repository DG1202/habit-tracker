import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHabitWithStreak, createTestContext, request, signIn, userIdOf, type TestContext } from './helpers.ts';

describe('check-ins API', () => {
  let ctx: TestContext;
  let alice: string;
  let aliceId: string;

  beforeEach(async () => {
    ctx = await createTestContext('2026-10-15T12:00:00.000Z');
    alice = await signIn(ctx, 'google');
    aliceId = await userIdOf(ctx, alice);
  });
  afterEach(async () => {
    await ctx.close();
  });

  const checkIn = (cookie: string, habitId: string, payload: object = {}) =>
    request(ctx, cookie, { method: 'POST', url: `/api/habits/${habitId}/check-ins`, payload });
  const undo = (cookie: string, habitId: string) => request(ctx, cookie, { method: 'DELETE', url: `/api/habits/${habitId}/check-ins/today` });

  it('creates a habit and checks in for today', async () => {
    const habit = (await request(ctx, alice, { method: 'POST', url: '/api/habits', payload: { name: 'Read', startDate: '2026-10-15' } })).json();
    const res = await checkIn(alice, habit.id);
    expect(res.statusCode).toBe(201);
    expect(res.json().stats).toEqual({ currentStreak: 1, bestStreak: 1, totalCheckIns: 1, checkedInToday: true });
    expect(await ctx.prisma.checkIn.findMany({ select: { date: true } })).toEqual([{ date: '2026-10-15' }]);
  });

  it('prevents a duplicate check-in for the same habit and date', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 0, endingOn: '2026-10-15' });
    expect((await checkIn(alice, habit.id)).statusCode).toBe(201);
    const second = await checkIn(alice, habit.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('CHECKIN_EXISTS');
    expect(await ctx.prisma.checkIn.count()).toBe(1);
  });

  it('rejects future and past dates', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 0, endingOn: '2026-10-15' });
    const future = await checkIn(alice, habit.id, { date: '2026-10-16' });
    expect(future.statusCode).toBe(422);
    expect(future.json().error.code).toBe('DATE_IN_FUTURE');
    const past = await checkIn(alice, habit.id, { date: '2026-10-14' });
    expect(past.statusCode).toBe(422);
    expect(past.json().error.code).toBe('BACKFILL_NOT_SUPPORTED');
    expect((await checkIn(alice, habit.id, { date: '2026-10-15' })).statusCode).toBe(201);
  });

  it.each(['PAUSED', 'ARCHIVED'] as const)('rejects check-ins and undo on %s habits', async (status) => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 1, endingOn: '2026-10-15', status });
    for (const res of [await checkIn(alice, habit.id), await undo(alice, habit.id)]) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('HABIT_NOT_ACTIVE');
    }
  });

  it('rejects check-ins before the start date', async () => {
    const habit = await ctx.prisma.habit.create({ data: { userId: aliceId, name: 'Later', startDate: '2026-10-20' } });
    const res = await checkIn(alice, habit.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('BEFORE_START_DATE');
  });

  it('undoes today and returns the habit with recalculated stats, as check-in does', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 4, endingOn: '2026-10-15' });
    const res = await undo(alice, habit.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().stats).toEqual({ currentStreak: 3, bestStreak: 3, totalCheckIns: 3, checkedInToday: false });
    const after = (await request(ctx, alice, { method: 'GET', url: `/api/habits/${habit.id}` })).json();
    expect(res.json()).toEqual(after);
    expect((await undo(alice, habit.id)).statusCode).toBe(404);
  });

  it("uses the user's local date around midnight", async () => {
    ctx.clock.set('2026-10-15T22:30:00.000Z');
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 0, endingOn: '2026-10-15' });

    await request(ctx, alice, { method: 'PUT', url: '/api/me/timezone', payload: { timezone: 'Europe/Kyiv' } });
    expect((await checkIn(alice, habit.id)).statusCode).toBe(201);
    await request(ctx, alice, { method: 'PUT', url: '/api/me/timezone', payload: { timezone: 'America/New_York' } });
    expect((await checkIn(alice, habit.id)).statusCode).toBe(201);

    const dates = (await ctx.prisma.checkIn.findMany({ orderBy: { date: 'asc' } })).map((c) => c.date);
    expect(dates).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('lists check-ins for the current month', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 17, endingOn: '2026-10-15' });
    const res = await request(ctx, alice, { method: 'GET', url: `/api/habits/${habit.id}/check-ins` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.month).toBe('2026-10');
    expect(body.today).toBe('2026-10-15');
    expect(body.dates).toHaveLength(15);
    expect(body.dates[0]).toBe('2026-10-01');

    const september = await request(ctx, alice, { method: 'GET', url: `/api/habits/${habit.id}/check-ins?month=2026-09` });
    expect(september.json().dates).toEqual(['2026-09-29', '2026-09-30']);
    expect((await request(ctx, alice, { method: 'GET', url: `/api/habits/${habit.id}/check-ins?month=2026-13` })).statusCode).toBe(400);
  });

  it("does not let another user touch someone else's check-ins", async () => {
    const bob = await signIn(ctx, 'github');
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 1, endingOn: '2026-10-15' });

    for (const res of [
      await checkIn(bob, habit.id),
      await undo(bob, habit.id),
      await request(ctx, bob, { method: 'GET', url: `/api/habits/${habit.id}/check-ins` }),
    ]) {
      expect(res.statusCode).toBe(404);
    }
    expect(await ctx.prisma.checkIn.count()).toBe(1);
    expect(await ctx.prisma.checkIn.findFirst({ where: { habitId: habit.id, date: '2026-10-15' } })).not.toBeNull();
  });

  it("rejects another user's check-in on a habit with no check-in today and writes nothing", async () => {
    const bob = await signIn(ctx, 'github');
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 0, endingOn: '2026-10-15' });

    expect((await checkIn(bob, habit.id)).statusCode).toBe(404);
    expect(await ctx.prisma.checkIn.count({ where: { habitId: habit.id } })).toBe(0);
  });

  it('stamps createdAt from the injected clock', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 0, endingOn: '2026-10-15' });
    expect((await checkIn(alice, habit.id)).statusCode).toBe(201);
    const row = await ctx.prisma.checkIn.findFirstOrThrow({ where: { habitId: habit.id } });
    expect(row.createdAt.toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });
});
