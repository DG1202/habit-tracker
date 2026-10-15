import type { FastifyRequest } from 'fastify';
import type { User } from '../generated/prisma/client.ts';
import { AppError } from '../lib/errors.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  return request.user;
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
