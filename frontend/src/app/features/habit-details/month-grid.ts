export interface DayCell {
  date: string;
  day: number;
  checked: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export type WeekRow = (DayCell | null)[];

export function buildMonthGrid(month: string, checkedDates: readonly string[], today: string): WeekRow[] {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const mondayFirstOffset = (new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay() + 6) % 7;
  const checked = new Set(checkedDates);

  const cells: (DayCell | null)[] = Array.from({ length: mondayFirstOffset }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day, checked: checked.has(date), isToday: date === today, isFuture: date > today });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: WeekRow[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
