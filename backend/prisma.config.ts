import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional here; DATABASE_URL may come from the shell.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'file:./dev.db' },
});
