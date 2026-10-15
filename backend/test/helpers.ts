import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.ts';
import type { Config } from '../src/config.ts';
import { createPrisma, type PrismaClient } from '../src/db.ts';
import type { ProviderClient, ProviderClients, ProviderName, ProviderProfile } from '../src/auth/providers.ts';

export const ORIGIN = 'http://localhost:4300';

export const TEST_CONFIG: Config = {
  NODE_ENV: 'test',
  PORT: 3300,
  APP_ORIGIN: ORIGIN,
  DATABASE_URL: 'file:unused',
  SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
  GOOGLE_CLIENT_ID: 'test',
  GOOGLE_CLIENT_SECRET: 'test',
  GITHUB_CLIENT_ID: 'test',
  GITHUB_CLIENT_SECRET: 'test',
};

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'prisma', 'migrations');

function applyMigrations(file: string): void {
  const db = new DatabaseSync(file);
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const dir of dirs) db.exec(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'));
  db.close();
}

export class TestClock {
  constructor(public current: Date) {}
  now(): Date {
    return this.current;
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
}

export const DEFAULT_PROFILES: Record<ProviderName, ProviderProfile> = {
  google: { providerUserId: 'google-user-1', email: 'alice@example.test', displayName: 'Alice Test', avatarUrl: 'https://example.test/alice.png' },
  github: { providerUserId: '1001', email: null, displayName: 'bob-test', avatarUrl: null },
};

export class StubProviders {
  profiles: Record<ProviderName, ProviderProfile> = structuredClone(DEFAULT_PROFILES);
  readonly clients: ProviderClients = { google: this.client('google'), github: this.client('github') };

  private client(name: ProviderName): ProviderClient {
    return {
      authorizationUrl: async () => `https://${name}.example.test/authorize?state=stub-state`,
      completeLogin: async (request) => {
        const { code } = request.query as { code?: string };
        if (code !== 'valid-code') throw new Error('invalid authorization code');
        return { ...this.profiles[name] };
      },
    };
  }
}

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  clock: TestClock;
  providers: StubProviders;
  close(): Promise<void>;
}

export async function createTestContext(now = '2026-10-15T12:00:00.000Z'): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), 'habit-tracker-test-'));
  const file = join(dir, 'test.db');
  applyMigrations(file);
  const prisma = createPrisma(`file:${file}`);
  const clock = new TestClock(new Date(now));
  const providers = new StubProviders();
  const app = await buildApp({ config: TEST_CONFIG, prisma, clock, providers: providers.clients });
  await app.ready();
  return {
    app,
    prisma,
    clock,
    providers,
    async close() {
      await app.close();
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function request(ctx: TestContext, cookie: string | null, options: InjectOptions) {
  return ctx.app.inject({
    ...options,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...options.headers },
  });
}

export async function signIn(ctx: TestContext, provider: ProviderName = 'google', profile: Partial<ProviderProfile> = {}): Promise<string> {
  ctx.providers.profiles[provider] = { ...DEFAULT_PROFILES[provider], ...profile };
  const res = await ctx.app.inject({ method: 'GET', url: `/api/auth/${provider}/callback?code=valid-code&state=stub-state` });
  const sid = res.cookies.find((cookie) => cookie.name === 'sid');
  if (!sid) throw new Error(`sign-in failed: ${res.statusCode} ${String(res.headers.location)}`);
  return `sid=${sid.value}`;
}

export async function userIdOf(ctx: TestContext, cookie: string): Promise<string> {
  const res = await request(ctx, cookie, { method: 'GET', url: '/api/auth/me' });
  return res.json<{ id: string }>().id;
}
