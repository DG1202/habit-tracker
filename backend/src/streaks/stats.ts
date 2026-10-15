import { addDays } from '../lib/dates.ts';

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  totalCheckIns: number;
  checkedInToday: boolean;
}

export function computeStats(dates: readonly string[], today: string): HabitStats {
  const unique = [...new Set(dates)].sort();
  let bestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of unique) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = date;
  }

  const checked = new Set(unique);
  const checkedInToday = checked.has(today);
  // Today stays open until local midnight, so an unchecked today does not break the streak yet.
  let cursor = checkedInToday ? today : addDays(today, -1);
  let currentStreak = 0;
  while (checked.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  return { currentStreak, bestStreak, totalCheckIns: unique.length, checkedInToday };
}
