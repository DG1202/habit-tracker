import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { config } from 'rxjs';
import { onTestFinished, vi } from 'vitest';
import type { Habit } from '../../core/models';
import { ToastService } from '../../core/toast-service';
import { HabitsPage } from './habits-page';

const HABIT: Habit = {
  id: 'h1',
  name: 'Read 20 pages',
  description: 'Before bed',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  startsInFuture: false,
  stats: { currentStreak: 4, bestStreak: 9, totalCheckIns: 21, checkedInToday: false },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const DEBOUNCE_MS = 250;

describe('HabitsPage', () => {
  let fixture: ComponentFixture<HabitsPage>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function settle() {
    await fixture.whenStable();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    // debounceTime runs on setInterval + Date.now; Angular's zoneless scheduler keeps its real setTimeout.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    TestBed.configureTestingModule({
      imports: [HabitsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HabitsPage);
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('shows a loading skeleton, then the "no habits" empty state', async () => {
    await settle();
    const req = http.expectOne((r) => r.url === '/api/habits');
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-busy="true"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent).toContain('Loading habits');

    req.flush([]);
    await fixture.whenStable();
    expect(text()).toContain('No habits yet');
    expect(text()).toContain('Create your first habit');
  });

  it('renders streak stats and today controls', async () => {
    await settle();
    http.expectOne((r) => r.url === '/api/habits').flush([HABIT]);
    await fixture.whenStable();
    expect(text()).toContain('Read 20 pages');
    expect(text()).toContain('Check in');
    const stats = (fixture.nativeElement as HTMLElement).querySelector('.habit-stats')!.textContent!;
    expect(stats).toMatch(/Current\s*🔥\s*4/);
    expect(stats).toMatch(/Best\s*9/);
    expect(stats).toMatch(/Total\s*21/);
  });

  it('shows a "no results" state when filters match nothing, and can clear filters', async () => {
    await settle();
    http.expectOne((r) => r.url === '/api/habits').flush([HABIT]);
    await fixture.whenStable();

    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    http.expectNone((r) => r.url === '/api/habits');
    await settle();
    const filtered = http.expectOne((r) => r.url === '/api/habits');
    expect(filtered.request.params.get('q')).toBe('zzz');
    filtered.flush([]);
    await fixture.whenStable();
    expect(text()).toContain('No habits match your filters');

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.empty-state button')!.click();
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/habits' && !r.params.has('q')).flush([HABIT]);
    await fixture.whenStable();
    expect(text()).toContain('Read 20 pages');
  });

  it('shows an error banner with retry when loading fails', async () => {
    await settle();
    http.expectOne((r) => r.url === '/api/habits').flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(text()).toContain('Server exploded');

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.alert button')!.click();
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/habits').flush([]);
    await fixture.whenStable();
    expect(text()).toContain('No habits yet');
  });

  describe('actions', () => {
    const root = () => fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === label)!;
    const list = () => http.expectOne((r) => r.url === '/api/habits' && r.method === 'GET');

    async function load(habit: Habit) {
      await settle();
      list().flush([habit]);
      await fixture.whenStable();
    }

    it('checks in, disables the button while pending, then reloads the list', async () => {
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      const req = http.expectOne('/api/habits/h1/check-ins');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      expect(button('Check in').disabled).toBe(true);

      req.flush({ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } });
      await fixture.whenStable();
      list().flush([{ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } }]);
      await fixture.whenStable();
      expect(text()).toContain('Undo');
    });

    it('sends one request for a double click that lands before the button re-renders as disabled', async () => {
      await load(HABIT);
      button('Check in').click();
      button('Check in').click();
      await fixture.whenStable();
      http.expectOne('/api/habits/h1/check-ins').flush({ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } });
      await fixture.whenStable();
      list().flush([{ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } }]);
      await fixture.whenStable();
    });

    it('keeps the button busy until the reload completes, so a second click sends no request', async () => {
      const done = { ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } };
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      http.expectOne('/api/habits/h1/check-ins').flush(done);
      await fixture.whenStable();

      const reload = list();
      // The POST response is already applied, so the row shows Undo, still disabled until the reload lands.
      expect(button('✓ Done · Undo').disabled).toBe(true);
      button('✓ Done · Undo').click();
      await fixture.whenStable();
      http.expectNone('/api/habits/h1/check-ins/today');

      reload.flush([done]);
      await fixture.whenStable();
      expect(button('✓ Done · Undo').disabled).toBe(false);
    });

    it('shows the checked-in state from the POST response even when the reload fails', async () => {
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      http.expectOne('/api/habits/h1/check-ins').flush({ ...HABIT, stats: { ...HABIT.stats, currentStreak: 5, totalCheckIns: 22, checkedInToday: true } });
      await fixture.whenStable();
      list().flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(root().querySelector('ht-error-banner')).toBeNull();
      expect(button('✓ Done · Undo').disabled).toBe(false);
      expect(root().querySelector('.habit-stats')!.textContent).toMatch(/Current\s*🔥\s*5/);
      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'error' && t.message === 'Server exploded')).toBe(true);
    });

    it('applies the stats from the DELETE response, including best, even when the reload fails', async () => {
      await load({ ...HABIT, stats: { currentStreak: 9, bestStreak: 9, totalCheckIns: 22, checkedInToday: true } });
      button('✓ Done · Undo').click();
      await fixture.whenStable();
      http.expectOne('/api/habits/h1/check-ins/today').flush({ ...HABIT, stats: { currentStreak: 8, bestStreak: 8, totalCheckIns: 21, checkedInToday: false } });
      await fixture.whenStable();
      list().flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(button('Check in').disabled).toBe(false);
      const stats = root().querySelector('.habit-stats')!.textContent!;
      expect(stats).toMatch(/Current\s*🔥\s*8/);
      expect(stats).toMatch(/Best\s*8/);
      expect(stats).toMatch(/Total\s*21/);
    });

    it('shows a disabled "Starts on" instead of Check in when the server says the habit starts in the future', async () => {
      await load({ ...HABIT, startDate: '2999-01-01', startsInFuture: true });
      expect(button('Starts on 2999-01-01').disabled).toBe(true);
      expect(button('Check in')).toBeUndefined();
    });

    it("follows the server's startsInFuture rather than the client clock", async () => {
      await settle();
      list().flush([
        { ...HABIT, id: 'past', name: 'Past by client clock', startDate: '2000-01-01', startsInFuture: true },
        { ...HABIT, id: 'future', name: 'Future by client clock', startDate: '2999-01-01', startsInFuture: false },
      ]);
      await fixture.whenStable();
      expect(button('Starts on 2000-01-01').disabled).toBe(true);
      expect(button('Starts on 2999-01-01')).toBeUndefined();
      expect(Array.from(root().querySelectorAll<HTMLButtonElement>('.habit-today button')).map((b) => b.textContent!.trim())).toEqual([
        'Starts on 2000-01-01',
        'Check in',
      ]);
    });

    it('undoes today\'s check-in', async () => {
      await load({ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } });
      button('✓ Done · Undo').click();
      await fixture.whenStable();
      const req = http.expectOne('/api/habits/h1/check-ins/today');
      expect(req.request.method).toBe('DELETE');
      req.flush(HABIT);
      await fixture.whenStable();
      list().flush([HABIT]);
      await fixture.whenStable();
      expect(button('Check in').disabled).toBe(false);
    });

    it('pauses a habit', async () => {
      await load(HABIT);
      button('Pause').click();
      await fixture.whenStable();
      const req = http.expectOne('/api/habits/h1');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'PAUSED' });
      req.flush({ ...HABIT, status: 'PAUSED' });
      await fixture.whenStable();
      list().flush([{ ...HABIT, status: 'PAUSED' }]);
      await fixture.whenStable();
      expect(button('Resume')).toBeDefined();
      expect(button('Check in')).toBeUndefined();
      expect(root().querySelector('.badge')!.textContent).toContain('Paused');
    });

    it('shows the banner, not a toast, when a filter change replaces a pending action reload and fails', async () => {
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      http.expectOne('/api/habits/h1/check-ins').flush({ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } });
      await fixture.whenStable();
      const reload = list();

      button('Paused').click();
      await fixture.whenStable();
      expect(reload.cancelled).toBe(true);
      list().flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(root().querySelector('ht-error-banner')!.textContent).toContain('Server exploded');
      expect(root().querySelector('ht-habit-row')).toBeNull();
      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'error')).toBe(false);
    });

    it('shows the banner when an action reload for a newly selected filter fails', async () => {
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      const post = http.expectOne('/api/habits/h1/check-ins');
      button('Paused').click();
      await fixture.whenStable();
      const chipLoad = list();
      post.flush({ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } });
      await fixture.whenStable();
      expect(chipLoad.cancelled).toBe(true);
      list().flush({ error: { code: 'INTERNAL', message: 'Server exploded', details: [] } }, { status: 500, statusText: 'Error' });
      await fixture.whenStable();

      expect(root().querySelector('ht-error-banner')!.textContent).toContain('Server exploded');
      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'error')).toBe(false);
    });

    it('applies a status chip without waiting for the search debounce', async () => {
      await load(HABIT);
      button('Paused').click();
      await fixture.whenStable();
      const req = list();
      expect(req.request.params.get('status')).toBe('PAUSED');
      req.flush([]);
    });

    it('opens the form for a new habit, creates it, closes the dialog and reloads', async () => {
      await load(HABIT);
      button('+ New habit').click();
      await fixture.whenStable();
      expect(root().querySelector('dialog h2')!.textContent).toContain('New habit');

      const name = root().querySelector<HTMLInputElement>('dialog input[formcontrolname="name"]')!;
      name.value = 'Meditate';
      name.dispatchEvent(new Event('input'));
      root().querySelector('dialog form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      const create = http.expectOne((r) => r.url === '/api/habits' && r.method === 'POST');
      expect(create.request.body).toMatchObject({ name: 'Meditate' });
      create.flush({ ...HABIT, id: 'h2', name: 'Meditate' });
      await fixture.whenStable();

      expect(root().querySelector('dialog')).toBeNull();
      list().flush([HABIT, { ...HABIT, id: 'h2', name: 'Meditate' }]);
      await fixture.whenStable();
      expect(text()).toContain('Meditate');
    });

    it('opens the form prefilled for Edit and closes it on Cancel without a request', async () => {
      await load(HABIT);
      button('Edit').click();
      await fixture.whenStable();
      expect(root().querySelector<HTMLInputElement>('dialog input[formcontrolname="name"]')!.value).toBe('Read 20 pages');

      root().querySelector<HTMLButtonElement>('dialog .dialog-footer .btn-ghost')!.click();
      await fixture.whenStable();
      expect(root().querySelector('dialog')).toBeNull();
    });

    describe('focus', () => {
      // jsdom has no showModal(), so open the dialog by hand to make its controls focusable.
      const focusAndClick = async (target: HTMLButtonElement) => {
        target.focus();
        target.click();
        await fixture.whenStable();
        root().querySelector('dialog')!.setAttribute('open', '');
      };

      it('returns focus to "+ New habit" when the form dialog is cancelled', async () => {
        await load(HABIT);
        const opener = button('+ New habit');
        await focusAndClick(opener);
        root().querySelector<HTMLInputElement>('dialog input[formcontrolname="name"]')!.focus();
        expect(document.activeElement).not.toBe(opener);
        root().querySelector<HTMLButtonElement>('dialog .dialog-footer .btn-ghost')!.click();
        await fixture.whenStable();
        expect(root().querySelector('dialog')).toBeNull();
        expect(document.activeElement).toBe(opener);
      });

      it("returns focus to the row's Edit button when the form dialog is closed with Esc", async () => {
        await load(HABIT);
        const opener = button('Edit');
        await focusAndClick(opener);
        root().querySelector<HTMLInputElement>('dialog input[formcontrolname="name"]')!.focus();
        root().querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
        await fixture.whenStable();
        expect(root().querySelector('dialog')).toBeNull();
        expect(document.activeElement).toBe(opener);
      });

      it('returns focus to Delete when the confirmation is cancelled', async () => {
        await load({ ...HABIT, status: 'ARCHIVED' });
        const opener = button('Delete');
        await focusAndClick(opener);
        button('Cancel').focus();
        expect(document.activeElement).toBe(button('Cancel'));
        button('Cancel').click();
        await fixture.whenStable();
        expect(root().querySelector('dialog')).toBeNull();
        expect(document.activeElement).toBe(opener);
      });
    });

    it('cancelling the delete confirmation sends no request', async () => {
      await load({ ...HABIT, status: 'ARCHIVED' });
      button('Delete').click();
      await fixture.whenStable();
      expect(text()).toContain('cannot be undone');

      button('Cancel').click();
      await fixture.whenStable();
      expect(root().querySelector('dialog')).toBeNull();
      http.expectNone('/api/habits/h1');
    });

    it('confirming delete removes the habit, shows a success toast and reloads', async () => {
      // DELETE answers 204 with no body; handling it must not throw inside the subscriber.
      const unhandled = vi.fn();
      config.onUnhandledError = unhandled;
      onTestFinished(() => {
        config.onUnhandledError = null;
      });
      await load({ ...HABIT, status: 'ARCHIVED' });
      button('Delete').click();
      await fixture.whenStable();
      root().querySelector<HTMLButtonElement>('dialog .btn-primary')!.click();
      await fixture.whenStable();
      const req = http.expectOne('/api/habits/h1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      await fixture.whenStable();

      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'success' && t.message.includes('was deleted'))).toBe(true);
      list().flush([]);
      await fixture.whenStable();
      expect(root().querySelector('dialog')).toBeNull();
      expect(text()).toContain('No habits yet');
      await new Promise((resolve) => setTimeout(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    });

    it('shows an error toast when an action fails', async () => {
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      http
        .expectOne('/api/habits/h1/check-ins')
        .flush({ error: { code: 'CHECKIN_EXISTS', message: 'Already checked in today', details: [] } }, { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();
      expect(TestBed.inject(ToastService).toasts().some((t) => t.kind === 'error' && t.message === 'Already checked in today')).toBe(true);
    });
  });
});
