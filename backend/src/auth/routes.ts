import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';
import type { PrismaClient } from '../db.ts';
import { isValidTimeZone } from '../lib/dates.ts';
import { currentUser, toUserDto } from './current-user.ts';
import type { ProviderClients, ProviderName, ProviderProfile } from './providers.ts';
import { readSessionToken, SESSION_COOKIE, sessionCookieOptions, type SessionService } from './sessions.ts';

export interface AuthRouteDeps {
  config: Config;
  prisma: PrismaClient;
  sessions: SessionService;
  providers: ProviderClients;
}

const ProviderParams = z.object({ provider: z.enum(['google', 'github']) });
const TimezoneBody = z.strictObject({ timezone: z.string().max(64).refine(isValidTimeZone, 'Unknown timezone') });
const AUTH_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };

function upsertUser(prisma: PrismaClient, provider: ProviderName, profile: ProviderProfile) {
  const { providerUserId, email, displayName, avatarUrl } = profile;
  return prisma.user.upsert({
    where: { provider_providerUserId: { provider, providerUserId } },
    create: { provider, providerUserId, email, displayName, avatarUrl },
    update: { email, displayName, avatarUrl },
  });
}

export async function authRoutes(app: FastifyInstance, { config, prisma, sessions, providers }: AuthRouteDeps) {
  app.get('/auth/:provider/start', { config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const { provider } = ProviderParams.parse(request.params);
    return reply.redirect(await providers[provider].authorizationUrl(request, reply));
  });

  app.get('/auth/:provider/callback', { config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const { provider } = ProviderParams.parse(request.params);
    const { error } = request.query as { error?: string };
    if (error) {
      return reply.redirect(`${config.APP_ORIGIN}/login?error=${error === 'access_denied' ? 'access_denied' : 'sso_failed'}`);
    }
    try {
      const profile = await providers[provider].completeLogin(request, reply);
      const user = await upsertUser(prisma, provider, profile);
      reply.setCookie(SESSION_COOKIE, await sessions.create(user.id), sessionCookieOptions(config));
      return reply.redirect(`${config.APP_ORIGIN}/`);
    } catch (err) {
      request.log.warn({ provider, reason: err instanceof Error ? err.message : 'unknown' }, 'SSO callback failed');
      return reply.redirect(`${config.APP_ORIGIN}/login?error=sso_failed`);
    }
  });

  app.get('/auth/me', async (request) => toUserDto(currentUser(request)));

  app.post('/auth/logout', { config: AUTH_RATE_LIMIT }, async (request, reply) => {
    await sessions.destroy(readSessionToken(request));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.put('/me/timezone', async (request, reply) => {
    const user = currentUser(request);
    const { timezone } = TimezoneBody.parse(request.body);
    await prisma.user.update({ where: { id: user.id }, data: { timezone } });
    return reply.status(204).send();
  });
}
