import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';
import type { PrismaClient } from './db.ts';
import { systemClock, type Clock } from './lib/clock.ts';
import { AppError, errorHandler } from './lib/errors.ts';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { currentUser } from './auth/current-user.ts';
import { registerOAuthProviders, type ProviderClients } from './auth/providers.ts';
import { authRoutes } from './auth/routes.ts';
import { createSessionService, readSessionToken } from './auth/sessions.ts';
import { createHabitService } from './habits/service.ts';
import { habitRoutes } from './habits/routes.ts';
import { createCheckInService } from './checkins/service.ts';
import { checkInRoutes } from './checkins/routes.ts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  clock?: Clock;
  providers?: ProviderClients;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: deps.logger ?? (config.NODE_ENV === 'test' ? false : { level: 'info' }),
    bodyLimit: 16 * 1024,
  });
  app.removeContentTypeParser('text/plain');
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(() => {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  });

  const clock = deps.clock ?? systemClock;
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${context.after}.`),
  });

  const sessions = createSessionService(deps.prisma, clock);
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    if (MUTATING_METHODS.has(request.method) && request.headers.origin !== config.APP_ORIGIN) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Request origin is not allowed');
    }
    request.user = await sessions.resolve(readSessionToken(request));
  });

  const providers = deps.providers ?? (await registerOAuthProviders(app, config));
  await app.register(authRoutes, { prefix: '/api', config, prisma: deps.prisma, sessions, providers });

  const habits = createHabitService(deps.prisma, clock);
  const checkIns = createCheckInService(deps.prisma, clock, habits, async () => {});
  await app.register(
    async (scope) => {
      scope.addHook('preHandler', async (request) => {
        currentUser(request);
      });
      await scope.register(habitRoutes, { habits });
      await scope.register(checkInRoutes, { checkIns });
    },
    { prefix: '/api' },
  );

  app.get('/api/health', async () => ({ status: 'ok' }));
  return app;
}
