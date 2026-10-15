import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/db.ts';
import type { Hub } from '../src/milestones/hub.ts';
import { createMilestoneNotifier, createMilestoneService } from '../src/milestones/service.ts';
import { createHabitWithStreak, createTestContext, signIn, userIdOf, type TestContext } from './helpers.ts';

// A subscriber is live when evaluation starts but gone by the time the frames are sent.
function hubThatLosesItsSubscriber(delivered: object[]) {
  let live = true;
  return {
    hub: {
      has: () => true,
      send: (_userId: string, message: object) => {
        if (!live) return 0;
        delivered.push(message);
        return 1;
      },
    } as unknown as Hub,
    disconnect: () => {
      live = false;
    },
  };
}

describe('milestone notifier', () => {
  let ctx: TestContext;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    userId = await userIdOf(ctx, await signIn(ctx));
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('keeps a milestone pending when its last subscriber is gone by the time it is sent', async () => {
    await createHabitWithStreak(ctx, userId, { days: 7, endingOn: '2026-10-15' });
    const milestones = createMilestoneService(ctx.prisma, ctx.clock);
    const delivered: object[] = [];
    const fake = hubThatLosesItsSubscriber(delivered);
    const collectNew = milestones.collectNew;
    milestones.collectNew = async (id) => {
      const messages = await collectNew(id);
      fake.disconnect();
      return messages;
    };

    await createMilestoneNotifier(fake.hub, milestones).notifyUser(userId);
    expect(delivered).toEqual([]);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(0);

    const next = hubThatLosesItsSubscriber(delivered);
    await createMilestoneNotifier(next.hub, createMilestoneService(ctx.prisma, ctx.clock)).notifyUser(userId);
    expect(delivered.map((m) => (m as { milestone: number }).milestone)).toEqual([3, 7]);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(2);
  });

  it('records a delivered milestone once, ever', async () => {
    await createHabitWithStreak(ctx, userId, { days: 3, endingOn: '2026-10-15' });
    const delivered: object[] = [];
    const notifier = createMilestoneNotifier(hubThatLosesItsSubscriber(delivered).hub, createMilestoneService(ctx.prisma, ctx.clock));
    await notifier.notifyUser(userId);
    await notifier.notifyUser(userId);
    expect(delivered).toHaveLength(1);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(1);
  });

  it('skips a milestone another evaluation recorded concurrently (unique violation) and still records the rest', async () => {
    const habit = await createHabitWithStreak(ctx, userId, { days: 7, endingOn: '2026-10-15' });
    await ctx.prisma.milestoneNotification.create({ data: { habitId: habit.id, milestone: 3 } });
    // Reads as if the concurrent insert had not landed yet, so the insert itself hits the unique index.
    const stale = {
      user: ctx.prisma.user,
      milestoneNotification: ctx.prisma.milestoneNotification,
      habit: {
        findMany: async (args: object) =>
          (await ctx.prisma.habit.findMany(args as never)).map((h) => ({ ...h, notifications: [] })),
      },
    } as unknown as PrismaClient;

    const messages = await createMilestoneService(stale, ctx.clock).collectNew(userId);
    expect(messages.map((m) => m.milestone)).toEqual([7]);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(2);
  });
});
