import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { Habit } from '../../core/models';
import { ToastService } from '../../core/toast-service';
import { HabitsPage } from './habits-page';

const HABIT: Habit = {
  id: 'h1',
  name: 'Read 20 pages',
  description: 'Before bed',
  startDate: '2026-10-01',
  status: 'ACTIVE',
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
    await settle();
    const filtered = http.expectOne((r) => r.url === '/api/habits');
    expect(filtered.request.params.get('q')).toBe('zzz');
    filtered.flush([]);
    await fixture.whenStable();
    expect(text()).toContain('No habits match your filters');

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.empty-state button')!.click();
    await settle();
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

    it('keeps the button busy until the reload completes, so a second click sends no request', async () => {
      const done = { ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } };
      await load(HABIT);
      button('Check in').click();
      await fixture.whenStable();
      http.expectOne('/api/habits/h1/check-ins').flush(done);
      await fixture.whenStable();

      const reload = list();
      expect(button('Check in').disabled).toBe(true);
      button('Check in').click();
      await fixture.whenStable();
      http.expectNone('/api/habits/h1/check-ins');

      reload.flush([done]);
      await fixture.whenStable();
      expect(button('✓ Done · Undo').disabled).toBe(false);
    });

    it('undoes today\'s check-in', async () => {
      await load({ ...HABIT, stats: { ...HABIT.stats, checkedInToday: true } });
      button('✓ Done · Undo').click();
      await fixture.whenStable();
      const req = http.expectOne('/api/habits/h1/check-ins/today');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      await fixture.whenStable();
      list().flush([HABIT]);
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
