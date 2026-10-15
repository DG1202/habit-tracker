import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCheckInService } from '../src/checkins/service.ts';
import type { PrismaClient } from '../src/db.ts';
import type { User } from '../src/generated/prisma/client.ts';
import { createHabitService } from '../src/habits/service.ts';
import { createHabitWithStreak, createTestContext, signIn, userIdOf, type TestContext } from './helpers.ts';

// Runs `before` right ahead of the named writes, standing in for a concurrent request that lands in between.
function beforeWrites(prisma: PrismaClient, model: 'habit' | 'checkIn', methods: string[], before: () => Promise<unknown>) {
  return new Proxy(prisma, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop !== model) return typeof value === 'function' ? value.bind(target) : value;
      return new Proxy(value, {
        get(delegate, name) {
          const method = Reflect.get(delegate, name);
          if (typeof method !== 'function') return method;
          if (!methods.includes(String(name))) return method.bind(delegate);
          return async (...args: unknown[]) => {
            await before();
            return method.apply(delegate, args);
          };
        },
      });
    },
  });
}

describe('concurrent changes between the ownership check and the write', () => {
  let ctx: TestContext;
  let user: User;

  beforeEach(async () => {
    ctx = await createTestContext('2026-10-15T12:00:00.000Z');
    user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: await userIdOf(ctx, await signIn(ctx)) } });
  });
  afterEach(async () => {
    await ctx.close();
  });

  const deleteHabit = (id: string) => () => ctx.prisma.habit.deleteMany({ where: { id } });

  it('answers 404 when the habit is deleted while it is being edited', async () => {
    const habit = await createHabitWithStreak(ctx, user.id, { days: 0, endingOn: '2026-10-15' });
    const prisma = beforeWrites(ctx.prisma, 'habit', ['update', 'updateMany'], deleteHabit(habit.id));
    await expect(createHabitService(prisma, ctx.clock).update(user, habit.id, { name: 'Renamed' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('answers 404 when an archived habit is deleted twice at once', async () => {
    const habit = await createHabitWithStreak(ctx, user.id, { days: 0, endingOn: '2026-10-15', status: 'ARCHIVED' });
    const prisma = beforeWrites(ctx.prisma, 'habit', ['delete', 'deleteMany'], deleteHabit(habit.id));
    await expect(createHabitService(prisma, ctx.clock).remove(user, habit.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a later start date when a check-in before it lands during the edit', async () => {
    const habit = await ctx.prisma.habit.create({ data: { userId: user.id, name: 'Run', startDate: '2026-10-01' } });
    const prisma = beforeWrites(ctx.prisma, 'habit', ['update', 'updateMany'], () =>
      ctx.prisma.checkIn.create({ data: { habitId: habit.id, date: '2026-10-05' } }),
    );
    await expect(createHabitService(prisma, ctx.clock).update(user, habit.id, { startDate: '2026-10-10' })).rejects.toMatchObject({
      statusCode: 422,
      code: 'START_DATE_AFTER_CHECKINS',
    });
    expect((await ctx.prisma.habit.findUniqueOrThrow({ where: { id: habit.id } })).startDate).toBe('2026-10-01');
  });

  it('answers 404 when the habit is deleted while checking in', async () => {
    const habit = await createHabitWithStreak(ctx, user.id, { days: 0, endingOn: '2026-10-15' });
    const prisma = beforeWrites(ctx.prisma, 'checkIn', ['create'], deleteHabit(habit.id));
    const checkIns = createCheckInService(prisma, ctx.clock, createHabitService(prisma, ctx.clock), async () => {});
    await expect(checkIns.checkIn(user, habit.id, {})).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});

describe('habit list', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext('2026-10-15T23:59:59.999Z');
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('judges every habit against the same "today" even when midnight passes mid-request', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: await userIdOf(ctx, await signIn(ctx)) } });
    await createHabitWithStreak(ctx, user.id, { days: 1, endingOn: '2026-10-15', name: 'A' });
    await createHabitWithStreak(ctx, user.id, { days: 1, endingOn: '2026-10-15', name: 'B' });
    const times = ['2026-10-15T23:59:59.999Z', '2026-10-16T00:00:00.000Z'];
    const clock = { now: () => new Date(times.shift() ?? '2026-10-16T00:00:00.000Z') };

    const habits = await createHabitService(ctx.prisma, clock).list(user, {});
    expect(habits.map((h) => h.stats.checkedInToday)).toEqual([true, true]);
  });
});
