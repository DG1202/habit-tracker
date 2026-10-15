import type { FastifyInstance } from 'fastify';
import { currentUser } from '../auth/current-user.ts';
import { CreateHabitBody, HabitIdParams, ListHabitsQuery, UpdateHabitBody } from './schemas.ts';
import type { HabitService } from './service.ts';

export async function habitRoutes(app: FastifyInstance, { habits }: { habits: HabitService }) {
  app.get('/habits', async (request) => habits.list(currentUser(request), ListHabitsQuery.parse(request.query)));

  app.post('/habits', async (request, reply) => {
    const habit = await habits.create(currentUser(request), CreateHabitBody.parse(request.body));
    return reply.status(201).send(habit);
  });

  app.get('/habits/:id', async (request) => habits.get(currentUser(request), HabitIdParams.parse(request.params).id));

  app.patch('/habits/:id', async (request) =>
    habits.update(currentUser(request), HabitIdParams.parse(request.params).id, UpdateHabitBody.parse(request.body)),
  );

  app.delete('/habits/:id', async (request, reply) => {
    await habits.remove(currentUser(request), HabitIdParams.parse(request.params).id);
    return reply.status(204).send();
  });
}
