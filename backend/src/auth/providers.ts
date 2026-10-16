import { fastifyOauth2 as oauth2, type OAuth2Namespace } from '@fastify/oauth2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';

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

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
    githubOAuth2: OAuth2Namespace;
  }
}

// The default names @fastify/oauth2 uses with hostPrefixedCookies; a __Host- cookie is only cleared with Secure and Path=/.
const OAUTH_COOKIES = ['__Host-oauth2-redirect-state', '__Host-oauth2-code-verifier'];
const OAUTH_COOKIE_OPTIONS = { path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const };

export function clearOAuthCookies(reply: FastifyReply): void {
  for (const name of OAUTH_COOKIES) reply.clearCookie(name, OAUTH_COOKIE_OPTIONS);
}

const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

const GoogleUserInfo = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

const GithubUser = z.object({
  id: z.number(),
  login: z.string().min(1),
  name: z.string().nullish(),
  avatar_url: z.string().nullish(),
});

const GithubEmails = z.array(z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }));

function httpsOrNull(url: string | null | undefined): string | null {
  return url && url.startsWith('https://') ? url : null;
}

export function mapGoogleProfile(raw: unknown): ProviderProfile {
  const info = GoogleUserInfo.parse(raw);
  const email = info.email && info.email_verified ? info.email : null;
  return { providerUserId: info.sub, email, displayName: info.name || email || 'Google user', avatarUrl: httpsOrNull(info.picture) };
}

export function mapGithubProfile(rawUser: unknown, rawEmails: unknown): ProviderProfile {
  const user = GithubUser.parse(rawUser);
  const emails = GithubEmails.safeParse(rawEmails);
  const primary = emails.success ? emails.data.find((entry) => entry.primary && entry.verified) : undefined;
  return {
    providerUserId: String(user.id),
    email: primary?.email ?? null,
    displayName: user.name || user.login,
    avatarUrl: httpsOrNull(user.avatar_url),
  };
}

async function fetchJson(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'habit-tracker' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Profile request failed with status ${res.status}`);
  return res.json();
}

export async function registerOAuthProviders(app: FastifyInstance, config: Config): Promise<ProviderClients> {
  const shared = { pkce: 'S256' as const, hostPrefixedCookies: true, cookie: { httpOnly: true, sameSite: 'lax' as const } };

  await app.register(oauth2, {
    ...shared,
    name: 'googleOAuth2',
    scope: ['openid', 'email', 'profile'],
    credentials: { client: { id: config.GOOGLE_CLIENT_ID, secret: config.GOOGLE_CLIENT_SECRET }, auth: oauth2.GOOGLE_CONFIGURATION },
    callbackUri: `${config.APP_ORIGIN}/api/auth/google/callback`,
  });
  await app.register(oauth2, {
    ...shared,
    name: 'githubOAuth2',
    scope: ['read:user', 'user:email'],
    credentials: { client: { id: config.GITHUB_CLIENT_ID, secret: config.GITHUB_CLIENT_SECRET }, auth: oauth2.GITHUB_CONFIGURATION },
    callbackUri: `${config.APP_ORIGIN}/api/auth/github/callback`,
  });

  return {
    google: {
      authorizationUrl: (request, reply) => app.googleOAuth2.generateAuthorizationUri(request, reply),
      completeLogin: async (request, reply) => {
        const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);
        return mapGoogleProfile(await fetchJson(GOOGLE_USERINFO_URL, token.access_token));
      },
    },
    github: {
      authorizationUrl: (request, reply) => app.githubOAuth2.generateAuthorizationUri(request, reply),
      completeLogin: async (request, reply) => {
        const { token } = await app.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);
        const user = await fetchJson(GITHUB_USER_URL, token.access_token);
        const emails = await fetchJson(GITHUB_EMAILS_URL, token.access_token).catch(() => null);
        return mapGithubProfile(user, emails);
      },
    },
  };
}
