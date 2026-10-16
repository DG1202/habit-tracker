import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from '../src/db.ts';
import { applyMigrations, TEST_CONFIG } from './helpers.ts';

const run = promisify(execFile);
const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx');
const SCRIPT = join(import.meta.dirname, '..', 'src', 'scripts', 'seed-demo.ts');

describe('seed:demo', () => {
  let dir: string;
  let prisma: PrismaClient;
  let env: NodeJS.ProcessEnv;
  let userId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'habit-tracker-seed-'));
    const file = join(dir, 'seed.db');
    applyMigrations(file);
    prisma = createPrisma(`file:${file}`);
    userId = (await prisma.user.create({ data: { provider: 'google', providerUserId: 'seed-1', displayName: 'Synthetic Seed Person' } })).id;
    env = { ...process.env, ...TEST_CONFIG, NODE_ENV: 'development', PORT: '3300', DATABASE_URL: `file:${file}` };
  });
  afterEach(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists known users by id and provider only when the id is missing', async () => {
    const failure = await run(TSX, [SCRIPT], { env }).catch((error: { code: number; stdout: string; stderr: string }) => error);
    expect(failure).toMatchObject({ code: 1 });
    const output = `${(failure as { stdout: string }).stdout}${(failure as { stderr: string }).stderr}`;
    expect(output).toContain(userId);
    expect(output).not.toContain('Synthetic Seed Person');
  });

  it('adds a fresh set of demo habits on every run', async () => {
    await run(TSX, [SCRIPT, '--user-id', userId], { env });
    await run(TSX, [SCRIPT, '--user-id', userId], { env });
    expect(await prisma.habit.count({ where: { userId } })).toBe(8);
    expect(await prisma.milestoneNotification.count()).toBe(0);
  });
});
