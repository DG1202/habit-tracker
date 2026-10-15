import type { Habit } from './models';
import { withoutTodayCheckIn } from './habit-updates';

const DONE: Habit = {
  id: 'h1',
  name: 'Drink water',
  description: '',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  stats: { currentStreak: 5, bestStreak: 9, totalCheckIns: 12, checkedInToday: true },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('withoutTodayCheckIn', () => {
  it('removes today from the current streak and the total', () => {
    expect(withoutTodayCheckIn(DONE).stats).toEqual({ currentStreak: 4, bestStreak: 9, totalCheckIns: 11, checkedInToday: false });
  });

  it('leaves a habit without a check-in today unchanged', () => {
    const open = { ...DONE, stats: { ...DONE.stats, checkedInToday: false } };
    expect(withoutTodayCheckIn(open)).toBe(open);
  });
});
