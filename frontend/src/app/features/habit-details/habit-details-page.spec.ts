import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Habit, MonthCheckIns } from '../../core/models';
import { ToastService } from '../../core/toast-service';
import { HabitDetailsPage } from './habit-details-page';

const HABIT: Habit = {
  id: 'h1',
  name: 'Stretch for 10 minutes',
  description: '',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  stats: { currentStreak: 2, bestStreak: 5, totalCheckIns: 8, checkedInToday: false },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const DONE: Habit = { ...HABIT, stats: { ...HABIT.stats, currentStreak: 3, totalCheckIns: 9, checkedInToday: true } };
const MONTH: MonthCheckIns = { month: '2026-10', today: '2026-10-15', dates: ['2026-10-13', '2026-10-14'] };

describe('HabitDetailsPage', () => {
  let fixture: ComponentFixture<HabitDetailsPage>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const button = (label: string) => Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === label)!;

  async function flushLoad(habit: Habit) {
    http.expectOne('/api/habits/h1').flush(habit);
    http.expectOne('/api/habits/h1/check-ins').flush(MONTH);
    await fixture.whenStable();
  }

  async function checkIn() {
    button('Check in for today').click();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST');
    req.flush(DONE);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HabitDetailsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HabitDetailsPage);
    fixture.componentRef.setInput('id', 'h1');
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('keeps the button busy until the reload completes, so a second click sends no request', async () => {
    await flushLoad(HABIT);
    await checkIn();

    expect(button('Check in for today').disabled).toBe(true);
    button('Check in for today').click();
    await fixture.whenStable();
    http.expectNone((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST');

    await flushLoad(DONE);
    expect(button('✓ Done today · Undo').disabled).toBe(false);
  });

  it('keeps the page and shows a toast when the reload after a successful check-in fails', async () => {
    await flushLoad(HABIT);
    await checkIn();

    http.expectOne('/api/habits/h1').flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
    http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'GET');
    await fixture.whenStable();

    expect(root().querySelector('ht-error-banner')).toBeNull();
    expect(text()).toContain('Stretch for 10 minutes');
    expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'error' && t.message === 'Server exploded')).toBe(true);
    expect(button('Check in for today').disabled).toBe(false);
  });

  it('still shows the error banner when the first load fails', async () => {
    http.expectOne('/api/habits/h1').flush({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } }, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/habits/h1/check-ins');
    await fixture.whenStable();
    expect(root().querySelector('ht-error-banner')).not.toBeNull();
    expect(text()).toContain('This habit does not exist or is not yours.');
  });
});
