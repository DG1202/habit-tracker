import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.ts';
import type { Config } from '../src/config.ts';
import { createPrisma, type PrismaClient } from '../src/db.ts';
import { addDays } from '../src/lib/dates.ts';
import type { ProviderClient, ProviderClients, ProviderName, ProviderProfile } from '../src/auth/providers.ts';
import type { WebSocket } from 'ws';

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

export async function createHabitWithStreak(
  ctx: TestContext,
  userId: string,
  options: { days: number; endingOn: string; name?: string; status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' },
) {
  const habit = await ctx.prisma.habit.create({
    data: {
      userId,
      name: options.name ?? `Habit with ${options.days} days`,
      startDate: addDays(options.endingOn, -60),
      status: options.status ?? 'ACTIVE',
    },
  });
  if (options.days > 0) {
    await ctx.prisma.checkIn.createMany({
      data: Array.from({ length: options.days }, (_, i) => ({ habitId: habit.id, date: addDays(options.endingOn, -i) })),
    });
  }
  return habit;
}

export type ServerMessage = { type: string } & Record<string, unknown>;

export async function openSocket(ctx: TestContext, cookie: string | null, origin = ORIGIN) {
  // injectWS supplies no socket, so request.ip (used by rate limiting) would be undefined.
  const socket = { remoteAddress: '127.0.0.1' } as Socket;
  const ws = await ctx.app.injectWS('/ws', { headers: { origin, ...(cookie ? { cookie } : {}) }, socket });
  const messages: ServerMessage[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  return { ws, messages };
}

export async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function subscribe(socket: { ws: WebSocket; messages: ServerMessage[] }) {
  socket.ws.send(JSON.stringify({ type: 'subscribe', topics: ['milestones'] }));
  await waitFor(() => socket.messages.some((m) => m.type === 'subscribed'));
  await sleep(50);
}

export const milestonesOf = (messages: ServerMessage[]) =>
  messages.filter((m) => m.type === 'milestone').map((m) => m.milestone);
