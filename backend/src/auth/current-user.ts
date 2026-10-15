import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '../generated/prisma/client.ts';
import { AppError } from '../lib/errors.ts';
import type { SessionRef } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    session: SessionRef | null;
  }
}

export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  return request.user;
}

// Rebuilt from the server logger so a sign-in over another user's session does not carry two userIds.
// reply.log writes the "request completed" line, so it is rebound too.
export function bindUserToLog(request: FastifyRequest, reply: FastifyReply, userId: string): void {
  reply.log = request.log = request.server.log.child({ reqId: request.id, userId });
}

export function toUserDto(user: User) {
  return {
    id: user.id,
    provider: user.provider,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
  };
}
