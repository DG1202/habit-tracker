import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';
import type { PrismaClient } from './db.ts';
import { systemClock, type Clock } from './lib/clock.ts';
import { AppError, errorHandler } from './lib/errors.ts';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { currentUser } from './auth/current-user.ts';
import { registerOAuthProviders, type ProviderClients } from './auth/providers.ts';
import { authRoutes } from './auth/routes.ts';
import { createSessionService, readSessionToken } from './auth/sessions.ts';
import { createHabitService } from './habits/service.ts';
import { habitRoutes } from './habits/routes.ts';
import { createCheckInService } from './checkins/service.ts';
import { checkInRoutes } from './checkins/routes.ts';
import { createHub } from './milestones/hub.ts';
import { createMilestoneNotifier, createMilestoneService } from './milestones/service.ts';
import { wsRoutes } from './milestones/ws-route.ts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  clock?: Clock;
  providers?: ProviderClients;
  logger?: FastifyServerOptions['logger'];
}

export function loggerOptions(config: Config, stream?: { write(message: string): void }): FastifyServerOptions['logger'] {
  if (config.NODE_ENV === 'test' && !stream) return false;
  return {
    level: 'info',
    ...(stream ? { stream } : {}),
    serializers: {
      req: (request: { method: string; url: string }) => ({ method: request.method, url: request.url.split('?')[0] }),
      // Fastify's typing demands message and stack in the result; omitting them is the point.
      err: ((error: Error & { code?: unknown; statusCode?: unknown }) => ({
        type: error.name,
        ...(typeof error.code === 'string' ? { code: error.code } : {}),
        ...(typeof error.statusCode === 'number' ? { statusCode: error.statusCode } : {}),
        ...(error instanceof AppError ? { message: error.message } : {}),
      })) as never,
    },
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: deps.logger ?? loggerOptions(config),
    bodyLimit: 16 * 1024,
  });
  app.removeContentTypeParser('text/plain');
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(() => {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  });

  const clock = deps.clock ?? systemClock;
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${context.after}.`),
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  const sessions = createSessionService(deps.prisma, clock);
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (request) => {
    if (MUTATING_METHODS.has(request.method) && request.headers.origin !== config.APP_ORIGIN) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Request origin is not allowed');
    }
    const resolved = await sessions.resolve(readSessionToken(request));
    request.user = resolved?.user ?? null;
    request.session = resolved?.session ?? null;
  });

  const hub = createHub(clock);
  const providers = deps.providers ?? (await registerOAuthProviders(app, config));
  await app.register(authRoutes, { prefix: '/api', config, prisma: deps.prisma, sessions, providers, hub });

  const habits = createHabitService(deps.prisma, clock);
  const milestones = createMilestoneService(deps.prisma, clock);
  const notifier = createMilestoneNotifier(hub, milestones);
  const checkIns = createCheckInService(deps.prisma, clock, habits, (userId) =>
    notifier.notifyUser(userId).catch((error) => app.log.error({ err: error }, 'Milestone notification failed')),
  );
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
  await app.register(wsRoutes, { config, clock, hub, milestones, notifier });

  app.get('/api/health', async () => ({ status: 'ok' }));
  return app;
}
