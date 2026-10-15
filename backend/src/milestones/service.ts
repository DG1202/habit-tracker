import { isUniqueViolation, type PrismaClient } from '../db.ts';
import type { Clock } from '../lib/clock.ts';
import { todayIn } from '../lib/dates.ts';
import { computeStats } from '../streaks/stats.ts';
import type { Hub } from './hub.ts';

export const MILESTONES = [3, 7, 30] as const;

export interface MilestoneMessage {
  type: 'milestone';
  id: string;
  habitId: string;
  habitName: string;
  milestone: number;
  currentStreak: number;
  sentAt: string;
}

export function createMilestoneService(prisma: PrismaClient, clock: Clock) {
  return {
    async collectNew(userId: string): Promise<MilestoneMessage[]> {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return [];
      const today = todayIn(user.timezone, clock.now());
      const habits = await prisma.habit.findMany({
        where: { userId },
        include: { checkIns: { select: { date: true } }, notifications: { select: { milestone: true } } },
      });

      const messages: MilestoneMessage[] = [];
      for (const habit of habits) {
        const { currentStreak } = computeStats(habit.checkIns.map((c) => c.date), today);
        const alreadySent = new Set(habit.notifications.map((n) => n.milestone));
        for (const milestone of MILESTONES) {
          if (milestone > currentStreak || alreadySent.has(milestone)) continue;
          try {
            // The unique (habitId, milestone) insert is the once-only guarantee across tabs and reconnects.
            const row = await prisma.milestoneNotification.create({ data: { habitId: habit.id, milestone, sentAt: clock.now() } });
            messages.push({
              type: 'milestone',
              id: row.id,
              habitId: habit.id,
              habitName: habit.name,
              milestone,
              currentStreak,
              sentAt: row.sentAt.toISOString(),
            });
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
          }
        }
      }
      return messages;
    },

    async ack(userId: string, id: string): Promise<boolean> {
      const notification = await prisma.milestoneNotification.findFirst({ where: { id, habit: { userId } } });
      if (!notification) return false;
      if (!notification.ackedAt) {
        await prisma.milestoneNotification.update({ where: { id }, data: { ackedAt: clock.now() } });
      }
      return true;
    },
  };
}

export type MilestoneService = ReturnType<typeof createMilestoneService>;

export function createMilestoneNotifier(hub: Hub, milestones: MilestoneService) {
  return {
    async notifyUser(userId: string): Promise<void> {
      // Recording a milestone as sent with nobody listening would lose it, so only evaluate while subscribed.
      if (!hub.has(userId)) return;
      for (const message of await milestones.collectNew(userId)) hub.send(userId, message);
    },
  };
}

export type MilestoneNotifier = ReturnType<typeof createMilestoneNotifier>;
