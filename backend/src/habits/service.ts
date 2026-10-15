import type { PrismaClient } from '../db.ts';
import type { Habit, User } from '../generated/prisma/client.ts';
import type { Clock } from '../lib/clock.ts';
import { todayIn } from '../lib/dates.ts';
import { AppError, notFound } from '../lib/errors.ts';
import { computeStats, type HabitStats } from '../streaks/stats.ts';
import type { CreateHabitInput, ListHabitsInput, UpdateHabitInput } from './schemas.ts';

export interface HabitDto {
  id: string;
  name: string;
  description: string;
  startDate: string;
  status: Habit['status'];
  stats: HabitStats;
  createdAt: string;
  updatedAt: string;
}

type HabitWithDates = Habit & { checkIns: { date: string }[] };

const withDates = { checkIns: { select: { date: true } } } as const;

function toDto(habit: HabitWithDates, today: string): HabitDto {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    startDate: habit.startDate,
    status: habit.status,
    stats: computeStats(habit.checkIns.map((c) => c.date), today),
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
  };
}

export function createHabitService(prisma: PrismaClient, clock: Clock) {
  const today = (user: User) => todayIn(user.timezone, clock.now());

  async function findOwned(userId: string, id: string): Promise<Habit> {
    const habit = await prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw notFound('Habit not found');
    return habit;
  }

  async function get(user: User, id: string): Promise<HabitDto> {
    const habit = await prisma.habit.findFirst({ where: { id, userId: user.id }, include: withDates });
    if (!habit) throw notFound('Habit not found');
    return toDto(habit, today(user));
  }

  return {
    findOwned,
    get,

    async list(user: User, query: ListHabitsInput): Promise<HabitDto[]> {
      const habits = await prisma.habit.findMany({ where: { userId: user.id }, include: withDates, orderBy: { createdAt: 'desc' } });
      const needle = query.q?.toLocaleLowerCase();
      return habits
        .map((habit) => toDto(habit, today(user)))
        .filter((habit) => !query.status || habit.status === query.status)
        .filter((habit) => !needle || `${habit.name}\n${habit.description}`.toLocaleLowerCase().includes(needle))
        .filter((habit) => !query.today || (habit.status === 'ACTIVE' && habit.stats.checkedInToday === (query.today === 'done')));
    },

    async create(user: User, input: CreateHabitInput): Promise<HabitDto> {
      const habit = await prisma.habit.create({ data: { userId: user.id, ...input }, include: withDates });
      return toDto(habit, today(user));
    },

    async update(user: User, id: string, input: UpdateHabitInput): Promise<HabitDto> {
      const habit = await findOwned(user.id, id);
      if (habit.status === 'ARCHIVED') throw new AppError(409, 'HABIT_ARCHIVED', 'Archived habits are read-only');
      if (input.startDate && input.startDate > habit.startDate) {
        const first = await prisma.checkIn.findFirst({ where: { habitId: id }, orderBy: { date: 'asc' } });
        if (first && first.date < input.startDate) {
          throw new AppError(422, 'START_DATE_AFTER_CHECKINS', `Start date cannot be after the first check-in (${first.date})`);
        }
      }
      await prisma.habit.update({ where: { id }, data: input });
      return get(user, id);
    },

    async remove(user: User, id: string): Promise<void> {
      const habit = await findOwned(user.id, id);
      if (habit.status !== 'ARCHIVED') throw new AppError(409, 'HABIT_NOT_ARCHIVED', 'Archive the habit before deleting it');
      await prisma.habit.delete({ where: { id } });
    },
  };
}

export type HabitService = ReturnType<typeof createHabitService>;
