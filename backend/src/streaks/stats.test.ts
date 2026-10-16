import { describe, expect, it } from 'vitest';
import { computeStats } from './stats.ts';

const TODAY = '2026-10-15';

describe('computeStats', () => {
  it('returns zeros with no check-ins', () => {
    expect(computeStats([], TODAY)).toEqual({ currentStreak: 0, bestStreak: 0, totalCheckIns: 0, checkedInToday: false });
  });

  it('counts a run ending today', () => {
    expect(computeStats(['2026-10-13', '2026-10-14', '2026-10-15'], TODAY)).toMatchObject({
      currentStreak: 3,
      bestStreak: 3,
      checkedInToday: true,
    });
  });

  it('keeps the streak alive through yesterday while today is still open', () => {
    expect(computeStats(['2026-10-13', '2026-10-14'], TODAY)).toMatchObject({ currentStreak: 2, checkedInToday: false });
  });

  it('resets the current streak after a missed day but keeps the best streak', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-10', '2026-10-15'];
    expect(computeStats(dates, TODAY)).toEqual({ currentStreak: 1, bestStreak: 4, totalCheckIns: 6, checkedInToday: true });
  });

  it('is zero when the last check-in is two days ago', () => {
    expect(computeStats(['2026-10-12', '2026-10-13'], TODAY).currentStreak).toBe(0);
  });

  it('recalculates when today is removed (undo)', () => {
    const withToday = ['2026-10-13', '2026-10-14', '2026-10-15'];
    expect(computeStats(withToday, TODAY).currentStreak).toBe(3);
    expect(computeStats(withToday.slice(0, 2), TODAY)).toMatchObject({ currentStreak: 2, totalCheckIns: 2, checkedInToday: false });
  });

  it('handles unsorted and duplicate input and month boundaries', () => {
    expect(computeStats(['2026-03-01', '2026-02-28', '2026-02-28'], '2026-03-01')).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      totalCheckIns: 2,
      checkedInToday: true,
    });
  });

  it('counts a streak across a leap day', () => {
    expect(computeStats(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01')).toMatchObject({ currentStreak: 3, bestStreak: 3 });
  });
});
