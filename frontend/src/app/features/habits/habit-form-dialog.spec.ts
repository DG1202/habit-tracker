import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { HabitsApi } from '../../core/habits-api';
import type { Habit } from '../../core/models';
import { HabitFormDialog } from './habit-form-dialog';

const HABIT: Habit = {
  id: 'h1',
  name: 'Read',
  description: '',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  stats: { currentStreak: 0, bestStreak: 0, totalCheckIns: 0, checkedInToday: false },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('HabitFormDialog', () => {
  let fixture: ComponentFixture<HabitFormDialog>;
  let api: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  const el = () => fixture.nativeElement as HTMLElement;

  function type(selector: string, value: string) {
    const input = el().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit() {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function render(habit: Habit | null = null) {
    api = { create: vi.fn(), update: vi.fn() };
    TestBed.configureTestingModule({ imports: [HabitFormDialog], providers: [{ provide: HabitsApi, useValue: api }] });
    fixture = TestBed.createComponent(HabitFormDialog);
    fixture.componentRef.setInput('habit', habit);
    await fixture.whenStable();
  }

  it('shows "Name is required" for an empty or blank name', async () => {
    await render();
    await submit();
    expect(el().textContent).toContain('Name is required');

    type('input[formcontrolname="name"]', '    ');
    await submit();
    expect(el().textContent).toContain('Name is required');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('enforces length limits and a valid start date', async () => {
    await render();
    type('input[formcontrolname="name"]', 'x'.repeat(81));
    type('textarea[formcontrolname="description"]', 'y'.repeat(501));
    type('input[formcontrolname="startDate"]', '');
    await submit();
    expect(el().textContent).toContain('Name must be at most 80 characters');
    expect(el().textContent).toContain('Description must be at most 500 characters');
    expect(el().textContent).toContain('Start date is required');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('creates a habit with trimmed values and emits saved', async () => {
    await render();
    api.create.mockReturnValue(of(HABIT));
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    type('input[formcontrolname="name"]', '  Read  ');
    type('input[formcontrolname="startDate"]', '2026-10-01');
    await submit();

    expect(api.create).toHaveBeenCalledWith({ name: 'Read', description: '', startDate: '2026-10-01' });
    expect(saved).toHaveBeenCalledWith(HABIT);
  });

  it('prefills and updates an existing habit', async () => {
    await render(HABIT);
    api.update.mockReturnValue(of({ ...HABIT, name: 'Read more' }));
    expect(el().querySelector<HTMLInputElement>('input[formcontrolname="name"]')!.value).toBe('Read');
    expect(el().textContent).toContain('Edit habit');

    type('input[formcontrolname="name"]', 'Read more');
    await submit();
    expect(api.update).toHaveBeenCalledWith('h1', { name: 'Read more', description: '', startDate: '2026-10-01' });
  });

  it('shows server validation errors on the matching field', async () => {
    await render();
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { error: { code: 'START_DATE_AFTER_CHECKINS', message: 'Start date cannot be after the first check-in', details: [{ path: 'startDate', message: 'Too late' }] } },
          }),
      ),
    );
    type('input[formcontrolname="name"]', 'Read');
    await submit();
    expect(el().textContent).toContain('Start date cannot be after the first check-in');
    expect(el().textContent).toContain('Too late');
  });

  it('rejects impossible dates such as 2026-02-30', async () => {
    await render();
    type('input[formcontrolname="name"]', 'Read');
    (fixture.componentInstance as unknown as { form: { controls: { startDate: { setValue(v: string): void } } } }).form.controls.startDate.setValue('2026-02-30');
    await submit();
    expect(el().textContent).toContain('Enter a valid date');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('cannot be closed while saving', async () => {
    await render();
    const pending = new Subject<Habit>();
    api.create.mockReturnValue(pending);
    const saved = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    type('input[formcontrolname="name"]', 'Read');
    await submit();

    el().querySelector<HTMLButtonElement>('.dialog-footer .btn-ghost')!.click();
    await fixture.whenStable();
    expect(closed).not.toHaveBeenCalled();

    el().querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();
    expect(closed).not.toHaveBeenCalled();

    pending.next(HABIT);
    pending.complete();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith(HABIT);
  });
});
