import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';
import type { PrismaClient } from './db.ts';
import { systemClock, type Clock } from './lib/clock.ts';
import { AppError, errorHandler } from './lib/errors.ts';
import type { ProviderClients } from './auth/providers.ts';

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

  app.get('/api/health', async () => ({ status: 'ok' }));
  return app;
}
