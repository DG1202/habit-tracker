import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPrisma } from './db.ts';

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const app = await buildApp({ config, prisma });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: '127.0.0.1', port: config.PORT });
