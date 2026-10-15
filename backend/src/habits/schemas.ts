import { z } from 'zod';
import { isValidDate } from '../lib/dates.ts';

export const HABIT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

const name = z.string().trim().min(1, 'Name is required').max(80, 'Name must be at most 80 characters');
const description = z.string().trim().max(500, 'Description must be at most 500 characters');
const startDate = z.string().refine(isValidDate, 'Start date must be a valid date (YYYY-MM-DD)');

export const CreateHabitBody = z.strictObject({ name, description: description.default(''), startDate });

export const UpdateHabitBody = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    startDate: startDate.optional(),
    status: z.enum(HABIT_STATUSES).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

export const ListHabitsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(HABIT_STATUSES).optional(),
  today: z.enum(['done', 'not_done']).optional(),
});

export const HabitIdParams = z.object({ id: z.string().min(1).max(64) });

export type CreateHabitInput = z.infer<typeof CreateHabitBody>;
export type UpdateHabitInput = z.infer<typeof UpdateHabitBody>;
export type ListHabitsInput = z.infer<typeof ListHabitsQuery>;
