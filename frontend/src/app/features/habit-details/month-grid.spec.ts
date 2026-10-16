import { buildMonthGrid } from './month-grid';

describe('buildMonthGrid', () => {
  it('lays October 2026 out on Monday-first weeks', () => {
    const weeks = buildMonthGrid('2026-10', ['2026-10-01', '2026-10-14'], '2026-10-15');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0]![3]).toEqual({
      date: '2026-10-01',
      day: 1,
      checked: true,
      isToday: false,
      isFuture: false,
      label: 'October 1, checked in',
    });
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks[4]!.at(-1)).toBeNull();
  });

  it('flags today and future days', () => {
    const cells = buildMonthGrid('2026-10', [], '2026-10-15').flat();
    expect(cells.find((c) => c?.date === '2026-10-15')).toMatchObject({
      isToday: true,
      isFuture: false,
    });
    expect(cells.find((c) => c?.date === '2026-10-16')).toMatchObject({
      isToday: false,
      isFuture: true,
    });
  });

  it('handles February in a leap year', () => {
    expect(buildMonthGrid('2028-02', [], '2028-02-01').flat().filter(Boolean)).toHaveLength(29);
  });

  it('puts a Sunday 1st in the last column (November 2026)', () => {
    const weeks = buildMonthGrid('2026-11', [], '2026-11-15');
    expect(weeks[0]!.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0]![6]).toMatchObject({ date: '2026-11-01', day: 1 });
    expect(weeks).toHaveLength(6);
    expect(weeks[5]![0]).toMatchObject({ date: '2026-11-30' });
    expect(weeks[5]!.slice(1)).toEqual([null, null, null, null, null, null]);
  });

  it('fills exactly four weeks when a 28-day month starts on Monday (February 2027)', () => {
    const weeks = buildMonthGrid('2027-02', [], '2027-02-10');
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every(Boolean)).toBe(true);
    expect(weeks[0]![0]).toMatchObject({ date: '2027-02-01', day: 1 });
    expect(weeks[3]![6]).toMatchObject({ date: '2027-02-28', day: 28 });
  });

  it('gives every day a readable label', () => {
    const cells = buildMonthGrid('2026-10', ['2026-10-14', '2026-10-15'], '2026-10-15').flat();
    const label = (date: string) => cells.find((c) => c?.date === date)!.label;
    expect(label('2026-10-13')).toBe('October 13, not checked in');
    expect(label('2026-10-14')).toBe('October 14, checked in');
    expect(label('2026-10-15')).toBe('October 15, today, checked in');
    expect(label('2026-10-16')).toBe('October 16, future');
    expect(
      buildMonthGrid('2026-10', [], '2026-10-15')
        .flat()
        .find((c) => c?.date === '2026-10-15')!.label,
    ).toBe('October 15, today');
  });
});
