import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../auth/current-user.ts';
import { HabitIdParams } from '../habits/schemas.ts';
import { isValidDate } from '../lib/dates.ts';
import type { CheckInService } from './service.ts';

const CheckInBody = z.strictObject({ date: z.string().refine(isValidDate, 'Date must be a valid date (YYYY-MM-DD)').optional() });
const MonthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM').optional() });

export async function checkInRoutes(app: FastifyInstance, { checkIns }: { checkIns: CheckInService }) {
  app.post('/habits/:id/check-ins', async (request, reply) => {
    const { id } = HabitIdParams.parse(request.params);
    const habit = await checkIns.checkIn(currentUser(request), id, CheckInBody.parse(request.body ?? {}));
    return reply.status(201).send(habit);
  });

  app.delete('/habits/:id/check-ins/today', async (request) =>
    checkIns.undoToday(currentUser(request), HabitIdParams.parse(request.params).id),
  );

  app.get('/habits/:id/check-ins', async (request) => {
    const { id } = HabitIdParams.parse(request.params);
    return checkIns.listMonth(currentUser(request), id, MonthQuery.parse(request.query).month);
  });
}
