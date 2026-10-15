import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
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

    // The POST response is already applied, so the page shows Undo, still disabled until the reload lands.
    expect(button('✓ Done today · Undo').disabled).toBe(true);
    button('✓ Done today · Undo').click();
    await fixture.whenStable();
    http.expectNone((r) => r.url === '/api/habits/h1/check-ins/today' && r.method === 'DELETE');

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
    // The POST response is applied before the reload, so the page shows the new state.
    expect(button('✓ Done today · Undo').disabled).toBe(false);
    expect(text()).toMatch(/Current streak\s*🔥 3/);
    expect(root().querySelectorAll('.day.checked')).toHaveLength(3);
  });

  it('applies the stats from the DELETE response, including best, even when the reload fails', async () => {
    http.expectOne('/api/habits/h1').flush({ ...DONE, stats: { ...DONE.stats, bestStreak: 3 } });
    http.expectOne('/api/habits/h1/check-ins').flush({ ...MONTH, dates: [...MONTH.dates, MONTH.today] });
    await fixture.whenStable();
    expect(root().querySelectorAll('.day.checked')).toHaveLength(3);

    button('✓ Done today · Undo').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/habits/h1/check-ins/today' && r.method === 'DELETE').flush({ ...HABIT, stats: { ...HABIT.stats, bestStreak: 2 } });
    await fixture.whenStable();
    http.expectOne('/api/habits/h1').flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
    http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'GET');
    await fixture.whenStable();

    expect(button('Check in for today').disabled).toBe(false);
    expect(text()).toMatch(/Current streak\s*🔥 2/);
    expect(text()).toMatch(/Best streak\s*2/);
    expect(text()).toMatch(/Total check-ins\s*8/);
    expect(root().querySelectorAll('.day.checked')).toHaveLength(2);
  });

  it('still shows the error banner when the first load fails', async () => {
    http.expectOne('/api/habits/h1').flush({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } }, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/habits/h1/check-ins');
    await fixture.whenStable();
    expect(root().querySelector('ht-error-banner')).not.toBeNull();
    expect(text()).toContain('This habit does not exist or is not yours.');
  });

  it('shows a disabled "Starts on" instead of Check in for a habit that starts in the future', async () => {
    await flushLoad({ ...HABIT, startDate: '2999-01-01' });
    expect(button('Starts on 2999-01-01').disabled).toBe(true);
    expect(button('Check in for today')).toBeUndefined();
  });

  it('renders the month as a table with weekday headers and readable day labels', async () => {
    await flushLoad(HABIT);
    const table = root().querySelector('table')!;
    expect(Array.from(table.querySelectorAll('thead th[scope="col"]')).map((th) => th.getAttribute('abbr'))).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5);
    const labels = Array.from(table.querySelectorAll('tbody td .visually-hidden')).map((el) => el.textContent!.trim());
    expect(labels).toContain('October 14, checked in');
    expect(labels).toContain('October 15, today');
    expect(labels).toContain('October 16, future');
  });

  it('loads the new habit when the id input changes', async () => {
    await flushLoad(HABIT);
    fixture.componentRef.setInput('id', 'h2');
    await fixture.whenStable();
    http.expectOne('/api/habits/h2').flush({ ...HABIT, id: 'h2', name: 'Walk 5,000 steps' });
    http.expectOne('/api/habits/h2/check-ins').flush(MONTH);
    await fixture.whenStable();
    expect(root().querySelector('h1')!.textContent).toBe('Walk 5,000 steps');
  });

  it('cancels a pending action when the page is destroyed', async () => {
    await flushLoad(HABIT);
    button('Check in for today').click();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST');
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });

  describe('status actions', () => {
    const labels = () => Array.from(root().querySelectorAll('ht-habit-actions button')).map((b) => b.textContent!.trim());
    const PAUSED: Habit = { ...HABIT, status: 'PAUSED' };
    const ARCHIVED: Habit = { ...HABIT, status: 'ARCHIVED' };

    it('follows the list\'s status rules', async () => {
      await flushLoad(HABIT);
      expect(labels()).toEqual(['Edit', 'Pause', 'Archive']);
    });

    it('offers Resume for a paused habit', async () => {
      await flushLoad(PAUSED);
      expect(labels()).toEqual(['Edit', 'Resume', 'Archive']);
    });

    it('makes an archived habit read-only except for Delete', async () => {
      await flushLoad(ARCHIVED);
      expect(labels()).toEqual(['Delete']);
      expect(button('Check in for today')).toBeUndefined();
    });

    it('pauses the habit and shows the result immediately', async () => {
      await flushLoad(HABIT);
      button('Pause').click();
      await fixture.whenStable();
      const req = http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'PATCH');
      expect(req.request.body).toEqual({ status: 'PAUSED' });
      req.flush(PAUSED);
      await fixture.whenStable();
      expect(labels()).toEqual(['Edit', 'Resume', 'Archive']);
      expect(root().querySelector('.badge')!.textContent).toContain('Paused');
      await flushLoad(PAUSED);
    });

    it('archives the habit', async () => {
      await flushLoad(HABIT);
      button('Archive').click();
      await fixture.whenStable();
      const req = http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'PATCH');
      expect(req.request.body).toEqual({ status: 'ARCHIVED' });
      req.flush(ARCHIVED);
      await fixture.whenStable();
      expect(labels()).toEqual(['Delete']);
      await flushLoad(ARCHIVED);
    });

    it('edits the habit in the shared form dialog', async () => {
      await flushLoad(HABIT);
      button('Edit').click();
      await fixture.whenStable();
      const name = root().querySelector<HTMLInputElement>('dialog input[formcontrolname="name"]')!;
      expect(name.value).toBe('Stretch for 10 minutes');

      name.value = 'Stretch for 15 minutes';
      name.dispatchEvent(new Event('input'));
      root().querySelector('dialog form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      const req = http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'PATCH');
      expect(req.request.body).toMatchObject({ name: 'Stretch for 15 minutes' });
      req.flush({ ...HABIT, name: 'Stretch for 15 minutes' });
      await fixture.whenStable();

      expect(root().querySelector('dialog')).toBeNull();
      expect(root().querySelector('h1')!.textContent).toBe('Stretch for 15 minutes');
    });

    it('deletes an archived habit after in-app confirmation, then goes home with a toast', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await flushLoad(ARCHIVED);

      button('Delete').click();
      await fixture.whenStable();
      expect(root().querySelector('dialog')!.textContent).toContain('cannot be undone');
      button('Cancel').click();
      await fixture.whenStable();
      expect(root().querySelector('dialog')).toBeNull();
      http.expectNone((r) => r.method === 'DELETE');

      button('Delete').click();
      await fixture.whenStable();
      root().querySelector<HTMLButtonElement>('dialog .btn-primary')!.click();
      await fixture.whenStable();
      http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();

      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'success' && t.message === '"Stretch for 10 minutes" was deleted')).toBe(true);
      expect(navigate).toHaveBeenCalledWith(['/']);
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('shows a toast and stays when the delete fails', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await flushLoad(ARCHIVED);
      button('Delete').click();
      await fixture.whenStable();
      root().querySelector<HTMLButtonElement>('dialog .btn-primary')!.click();
      await fixture.whenStable();
      http
        .expectOne((r) => r.method === 'DELETE')
        .flush({ error: { code: 'HABIT_NOT_ARCHIVED', message: 'Only archived habits can be deleted', details: [] } }, { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();

      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'error' && t.message === 'Only archived habits can be deleted')).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
      expect(button('Delete').disabled).toBe(false);
    });
  });
});
