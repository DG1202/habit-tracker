import { buildMonthGrid } from './month-grid';

describe('buildMonthGrid', () => {
  it('lays October 2026 out on Monday-first weeks', () => {
    const weeks = buildMonthGrid('2026-10', ['2026-10-01', '2026-10-14'], '2026-10-15');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0]![3]).toEqual({ date: '2026-10-01', day: 1, checked: true, isToday: false, isFuture: false });
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks[4]!.at(-1)).toBeNull();
  });

  it('flags today and future days', () => {
    const cells = buildMonthGrid('2026-10', [], '2026-10-15').flat();
    expect(cells.find((c) => c?.date === '2026-10-15')).toMatchObject({ isToday: true, isFuture: false });
    expect(cells.find((c) => c?.date === '2026-10-16')).toMatchObject({ isToday: false, isFuture: true });
  });

  it('handles February in a leap year', () => {
    expect(buildMonthGrid('2028-02', [], '2028-02-01').flat().filter(Boolean)).toHaveLength(29);
  });
});
