import type { FastifyReply, FastifyRequest } from 'fastify';

export type ProviderName = 'google' | 'github';

export interface ProviderProfile {
  providerUserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProviderClient {
  authorizationUrl(request: FastifyRequest, reply: FastifyReply): Promise<string>;
  completeLogin(request: FastifyRequest, reply: FastifyReply): Promise<ProviderProfile>;
}

export type ProviderClients = Record<ProviderName, ProviderClient>;
