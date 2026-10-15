export interface DayCell {
  date: string;
  day: number;
  checked: boolean;
  isToday: boolean;
  isFuture: boolean;
  label: string;
}

export type WeekRow = (DayCell | null)[];

function dayLabel(
  year: number,
  monthIndex: number,
  day: number,
  cell: Omit<DayCell, 'label' | 'date' | 'day'>,
): string {
  const name = new Date(Date.UTC(year, monthIndex - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const parts = [name];
  if (cell.isToday) parts.push('today');
  if (cell.checked) parts.push('checked in');
  else if (cell.isFuture) parts.push('future');
  else if (!cell.isToday) parts.push('not checked in');
  return parts.join(', ');
}

export function buildMonthGrid(
  month: string,
  checkedDates: readonly string[],
  today: string,
): WeekRow[] {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const mondayFirstOffset = (new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay() + 6) % 7;
  const checked = new Set(checkedDates);

  const cells: (DayCell | null)[] = Array.from({ length: mondayFirstOffset }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const state = { checked: checked.has(date), isToday: date === today, isFuture: date > today };
    cells.push({ date, day, ...state, label: dayLabel(year, monthIndex, day, state) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: WeekRow[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
