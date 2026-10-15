import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../db.ts';
import type { Habit, User } from '../generated/prisma/client.ts';
import type { HabitDto, HabitService } from '../habits/service.ts';
import type { Clock } from '../lib/clock.ts';
import { todayIn } from '../lib/dates.ts';
import { AppError, notFound } from '../lib/errors.ts';

const notActive = () => new AppError(409, 'HABIT_NOT_ACTIVE', 'Only active habits can be checked in');

function assertStarted(habit: Habit, today: string): void {
  if (today < habit.startDate) throw new AppError(422, 'BEFORE_START_DATE', `This habit starts on ${habit.startDate}`);
}

export function createCheckInService(
  prisma: PrismaClient,
  clock: Clock,
  habits: HabitService,
  onCheckIn: (userId: string) => Promise<void>,
) {
  return {
    async checkIn(user: User, habitId: string, body: { date?: string }): Promise<HabitDto> {
      const habit = await habits.findOwned(user.id, habitId);
      if (habit.status !== 'ACTIVE') throw notActive();
      const today = todayIn(user.timezone, clock.now());
      if (body.date && body.date > today) throw new AppError(422, 'DATE_IN_FUTURE', 'Check-ins for future dates are not allowed');
      if (body.date && body.date < today) throw new AppError(422, 'BACKFILL_NOT_SUPPORTED', 'Only today can be checked in');
      assertStarted(habit, today);
      // One statement re-checks ownership, status and start date, so a concurrent edit cannot slip in before the insert.
      const inserted = await prisma.$executeRaw`
        INSERT INTO "CheckIn" ("id", "habitId", "date", "createdAt")
        SELECT ${randomUUID()}, "id", ${today}, ${new Date()} FROM "Habit"
        WHERE "id" = ${habitId} AND "userId" = ${user.id} AND "status" = 'ACTIVE' AND "startDate" <= ${today}
        ON CONFLICT ("habitId", "date") DO NOTHING`;
      if (inserted === 0) {
        const current = await habits.findOwned(user.id, habitId);
        if (current.status !== 'ACTIVE') throw notActive();
        assertStarted(current, today);
        throw new AppError(409, 'CHECKIN_EXISTS', 'Already checked in today');
      }
      await onCheckIn(user.id);
      return habits.get(user, habitId);
    },

    async undoToday(user: User, habitId: string): Promise<HabitDto> {
      const habit = await habits.findOwned(user.id, habitId);
      if (habit.status !== 'ACTIVE') throw notActive();
      const { count } = await prisma.checkIn.deleteMany({ where: { habitId, habit: { userId: user.id }, date: todayIn(user.timezone, clock.now()) } });
      if (count === 0) throw notFound('No check-in for today');
      return habits.get(user, habitId);
    },

    async listMonth(user: User, habitId: string, month?: string) {
      await habits.findOwned(user.id, habitId);
      const today = todayIn(user.timezone, clock.now());
      const target = month ?? today.slice(0, 7);
      const rows = await prisma.checkIn.findMany({
        where: { habitId, habit: { userId: user.id }, date: { startsWith: `${target}-` } },
        orderBy: { date: 'asc' },
        select: { date: true },
      });
      return { month: target, today, dates: rows.map((row) => row.date) };
    },
  };
}

export type CheckInService = ReturnType<typeof createCheckInService>;
