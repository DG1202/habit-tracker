import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Habit } from '../../core/models';
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

const DEBOUNCE_MS = 300;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('HabitsPage', () => {
  let fixture: ComponentFixture<HabitsPage>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function settle() {
    await wait(DEBOUNCE_MS);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HabitsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HabitsPage);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

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
});
