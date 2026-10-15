import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { PrismaClient } from '../db.ts';
import type { User } from '../generated/prisma/client.ts';
import type { Clock } from '../lib/clock.ts';

export const SESSION_COOKIE = 'sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface SessionRef {
  id: string;
  expiresAt: Date;
}

export function createSessionService(prisma: PrismaClient, clock: Clock) {
  return {
    async create(userId: string): Promise<string> {
      const token = randomBytes(32).toString('base64url');
      await prisma.session.create({
        data: { userId, tokenHash: hashToken(token), expiresAt: new Date(clock.now().getTime() + SESSION_TTL_MS) },
      });
      return token;
    },

    async resolve(token: string | undefined): Promise<{ user: User; session: SessionRef } | null> {
      if (!token) return null;
      const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
      if (!session) return null;
      if (session.expiresAt <= clock.now()) {
        await prisma.session.deleteMany({ where: { id: session.id } });
        return null;
      }
      return { user: session.user, session: { id: session.id, expiresAt: session.expiresAt } };
    },

    async destroy(token: string | undefined): Promise<void> {
      if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

export function readSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return undefined;
  const result = request.unsignCookie(raw);
  return result.valid && result.value ? result.value : undefined;
}

export function sessionCookieOptions(config: Config) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.NODE_ENV === 'production',
    signed: true,
    maxAge: SESSION_TTL_MS / 1000,
  };
}
