import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Title } from '@angular/platform-browser';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthStore } from '../../core/auth-store';
import type { Habit, MonthCheckIns, User } from '../../core/models';
import { ToastService } from '../../core/toast-service';
import { HabitDetailsPage } from './habit-details-page';

const HABIT: Habit = {
  id: 'h1',
  name: 'Stretch for 10 minutes',
  description: '',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  startsInFuture: false,
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

  it('announces the initial load through a named status region', async () => {
    const status = root().querySelector('.loading')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent!.trim()).toBe('Loading habit…');
    expect(root().querySelector('.spinner')!.getAttribute('aria-hidden')).toBe('true');
    expect(root().querySelector('[aria-label]:not([role]):not(button):not(a)')).toBeNull();
    await flushLoad(HABIT);
    expect(root().querySelector('.loading')).toBeNull();
  });

  it('puts the habit name in the document title once loaded', async () => {
    const title = TestBed.inject(Title);
    title.setTitle('Habit details · Habit Tracker');
    expect(title.getTitle()).toBe('Habit details · Habit Tracker');
    await flushLoad(HABIT);
    expect(title.getTitle()).toBe('Stretch for 10 minutes · Habit Tracker');
  });

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

  it('sends one request for a double click that lands before the button re-renders as disabled', async () => {
    await flushLoad(HABIT);
    button('Check in for today').click();
    button('Check in for today').click();
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST').flush(DONE);
    await fixture.whenStable();
    await flushLoad(DONE);
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

  it('shows a disabled "Starts on" instead of Check in when the server says the habit starts in the future', async () => {
    await flushLoad({ ...HABIT, startDate: '2999-01-01', startsInFuture: true });
    expect(button('Starts on 2999-01-01').disabled).toBe(true);
    expect(button('Check in for today')).toBeUndefined();
    expect(text()).not.toContain('Started');
    expect(text().match(/2999-01-01/g)).toHaveLength(1);
  });

  it('shows when a habit started once it has started', async () => {
    await flushLoad(HABIT);
    expect(text()).toContain('Started 2026-10-01');
  });

  it.each(['PAUSED', 'ARCHIVED'] as const)('says "Starts on" for a %s habit whose start date is after the server today', async (status) => {
    await flushLoad({ ...HABIT, status, startDate: '2026-10-20', startsInFuture: false });
    expect(text()).toContain('Starts on 2026-10-20');
    expect(text()).not.toContain('Started');
  });

  it('keeps "Started" for a paused habit whose start date is the server today', async () => {
    await flushLoad({ ...HABIT, status: 'PAUSED', startDate: MONTH.today });
    expect(text()).toContain(`Started ${MONTH.today}`);
  });

  describe('empty state copy', () => {
    const empty = (over: Partial<Habit>): Habit => ({ ...HABIT, ...over, stats: { ...HABIT.stats, totalCheckIns: 0 } });

    it('says when check-ins open for an active habit that starts in the future', async () => {
      await flushLoad(empty({ startDate: '2026-10-20', startsInFuture: true }));
      expect(text()).toContain('Check-ins open on 2026-10-20.');
      expect(text()).not.toContain('Check in today');
    });

    it('tells the user to resume a paused habit', async () => {
      await flushLoad(empty({ status: 'PAUSED' }));
      expect(text()).toContain('Resume this habit to check in.');
    });

    it('says an archived habit had no check-ins', async () => {
      await flushLoad(empty({ status: 'ARCHIVED' }));
      expect(text()).toContain('This habit was archived before any check-ins.');
    });

    it('keeps the default copy for an active habit that has started', async () => {
      await flushLoad(empty({}));
      expect(text()).toContain('Check in today to start your first streak.');
    });
  });

  it("follows the server's startsInFuture rather than comparing dates", async () => {
    await flushLoad({ ...HABIT, startDate: '2026-10-20', startsInFuture: false });
    expect(button('Check in for today').disabled).toBe(false);
    expect(button('Starts on 2026-10-20')).toBeUndefined();
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

  it("does not let the previous habit's slow responses overwrite the new one", async () => {
    const staleHabit = http.expectOne('/api/habits/h1');
    const staleMonth = http.expectOne('/api/habits/h1/check-ins');
    fixture.componentRef.setInput('id', 'h2');
    await fixture.whenStable();
    http.expectOne('/api/habits/h2').flush({ ...HABIT, id: 'h2', name: 'Walk 5,000 steps' });
    http.expectOne('/api/habits/h2/check-ins').flush(MONTH);
    await fixture.whenStable();

    expect(staleHabit.cancelled).toBe(true);
    expect(staleMonth.cancelled).toBe(true);
    expect(root().querySelector('h1')!.textContent).toBe('Walk 5,000 steps');
  });

  describe('when the id changes', () => {
    async function switchToH2() {
      fixture.componentRef.setInput('id', 'h2');
      await fixture.whenStable();
      http.expectOne('/api/habits/h2').flush({ ...HABIT, id: 'h2', name: 'Walk 5,000 steps' });
      http.expectOne('/api/habits/h2/check-ins').flush(MONTH);
      await fixture.whenStable();
    }

    it('closes the edit dialog and cancels its save', async () => {
      await flushLoad(HABIT);
      button('Edit').click();
      await fixture.whenStable();
      root().querySelector('dialog form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      const save = http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'PATCH');

      await switchToH2();
      expect(save.cancelled).toBe(true);
      expect(root().querySelector('dialog')).toBeNull();
      expect(root().querySelector('h1')!.textContent).toBe('Walk 5,000 steps');
    });

    it('closes the delete confirmation', async () => {
      await flushLoad({ ...HABIT, status: 'ARCHIVED' });
      button('Delete').click();
      await fixture.whenStable();
      expect(root().querySelector('dialog')).not.toBeNull();

      await switchToH2();
      expect(root().querySelector('dialog')).toBeNull();
    });

    it('cancels a pending action and does not apply it to the new habit', async () => {
      await flushLoad(HABIT);
      button('Check in for today').click();
      await fixture.whenStable();
      const post = http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST');

      await switchToH2();
      expect(post.cancelled).toBe(true);
      expect(button('Check in for today').disabled).toBe(false);
      http.expectNone('/api/habits/h1');
    });

    it('cancels a pending delete without navigating away', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await flushLoad({ ...HABIT, status: 'ARCHIVED' });
      button('Delete').click();
      await fixture.whenStable();
      root().querySelector<HTMLButtonElement>('dialog .btn-primary')!.click();
      await fixture.whenStable();
      const remove = http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'DELETE');

      await switchToH2();
      expect(remove.cancelled).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
      expect(button('Check in for today').disabled).toBe(false);
    });
  });

  it('cancels a pending action when the page is destroyed', async () => {
    await flushLoad(HABIT);
    button('Check in for today').click();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST');
    fixture.destroy();
    expect(req.cancelled).toBe(true);
  });

  async function confirmDelete() {
    button('Delete').click();
    await fixture.whenStable();
    root().querySelector<HTMLButtonElement>('dialog .btn-primary')!.click();
    await fixture.whenStable();
    return http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'DELETE');
  }

  it('does not report a pending delete as done when the page is destroyed', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await flushLoad({ ...HABIT, status: 'ARCHIVED' });
    const remove = await confirmDelete();
    fixture.destroy();
    expect(remove.cancelled).toBe(true);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  describe('when the user signs out', () => {
    const USER: User = { id: 'u1', provider: 'github', email: null, displayName: 'Alice Test', avatarUrl: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const loaded = TestBed.inject(AuthStore).ensureLoaded();
      http.expectOne('/api/auth/me').flush(USER);
      await loaded;
    });

    async function signOut() {
      TestBed.inject(AuthStore).logout();
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();
    }

    it('cancels a pending delete so its response shows no toast', async () => {
      await flushLoad({ ...HABIT, status: 'ARCHIVED' });
      const remove = await confirmDelete();
      await signOut();
      expect(remove.cancelled).toBe(true);
      expect(TestBed.inject(ToastService).toasts()).toEqual([]);
      expect(navigate).not.toHaveBeenCalledWith(['/']);
    });

    it('cancels a pending action so its response does not touch the page', async () => {
      await flushLoad(HABIT);
      button('Check in for today').click();
      await fixture.whenStable();
      const post = http.expectOne((r) => r.url === '/api/habits/h1/check-ins' && r.method === 'POST');
      await signOut();
      expect(post.cancelled).toBe(true);
      expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    });
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

    it('returns focus to Edit after saving in the form dialog', async () => {
      await flushLoad(HABIT);
      const opener = button('Edit');
      opener.focus();
      opener.click();
      await fixture.whenStable();
      // jsdom has no showModal(), so open the dialog by hand to make its controls focusable.
      root().querySelector('dialog')!.setAttribute('open', '');
      root().querySelector<HTMLButtonElement>('dialog button[type="submit"]')!.focus();
      expect(document.activeElement).not.toBe(opener);
      root().querySelector('dialog form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      http.expectOne((r) => r.url === '/api/habits/h1' && r.method === 'PATCH').flush(HABIT);
      await fixture.whenStable();

      expect(root().querySelector('dialog')).toBeNull();
      expect(document.activeElement).toBe(button('Edit'));
    });

    it('returns focus to Delete when the confirmation is cancelled with Esc', async () => {
      await flushLoad(ARCHIVED);
      const opener = button('Delete');
      opener.focus();
      opener.click();
      await fixture.whenStable();
      root().querySelector('dialog')!.setAttribute('open', '');
      button('Cancel').focus();
      expect(document.activeElement).toBe(button('Cancel'));
      root().querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
      await fixture.whenStable();

      expect(root().querySelector('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
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
