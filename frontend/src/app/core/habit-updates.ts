import type { Habit } from './models';

/** Local mirror of an undo (the DELETE returns no body); the best streak is left for the next reload. */
export function withoutTodayCheckIn(habit: Habit): Habit {
  if (!habit.stats.checkedInToday) return habit;
  const { stats } = habit;
  return {
    ...habit,
    stats: { ...stats, checkedInToday: false, currentStreak: Math.max(0, stats.currentStreak - 1), totalCheckIns: Math.max(0, stats.totalCheckIns - 1) },
  };
}
