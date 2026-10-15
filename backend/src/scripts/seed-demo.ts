import { parseArgs } from 'node:util';
import { loadConfig } from '../config.ts';
import { createPrisma } from '../db.ts';
import { addDays, todayIn } from '../lib/dates.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('seed:demo refuses to run with NODE_ENV=production');
  process.exit(1);
}

const { values } = parseArgs({ options: { 'user-id': { type: 'string' } } });
const userId = values['user-id'];
const prisma = createPrisma(config.DATABASE_URL);
const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
if (!user) {
  const users = await prisma.user.findMany({ select: { id: true, provider: true, displayName: true } });
  console.error('Usage: yarn seed:demo --user-id <id>. Known users:');
  console.table(users);
  process.exit(1);
}

const today = todayIn(user.timezone, new Date());
const demos: [name: string, daysEndingYesterday: number][] = [
  ['Demo · check in today for 3 days', 2],
  ['Demo · check in today for 7 days', 6],
  ['Demo · check in today for 30 days', 29],
  ['Demo · 7-day streak already', 7],
];

for (const [name, days] of demos) {
  const habit = await prisma.habit.create({
    data: { userId: user.id, name, description: 'Seeded demo data', startDate: addDays(today, -(days + 5)) },
  });
  await prisma.checkIn.createMany({
    data: Array.from({ length: days }, (_, i) => ({ habitId: habit.id, date: addDays(today, -(i + 1)) })),
  });
  console.log(`Created "${name}" with ${days} check-ins ending yesterday`);
}
await prisma.$disconnect();
