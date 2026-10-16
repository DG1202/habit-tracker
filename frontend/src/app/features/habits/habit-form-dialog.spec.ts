import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { HabitsApi } from '../../core/habits-api';
import type { Habit } from '../../core/models';
import { HabitFormDialog, validDate } from './habit-form-dialog';

const HABIT: Habit = {
  id: 'h1',
  name: 'Read',
  description: '',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  startsInFuture: false,
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
    TestBed.configureTestingModule({
      imports: [HabitFormDialog],
      providers: [{ provide: HabitsApi, useValue: api }],
    });
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

  it('rejects an impossible start date with "Enter a valid date" and sends no update', async () => {
    await render({ ...HABIT, startDate: '2026-02-30' });
    await submit();
    expect(el().textContent).toContain('Enter a valid date');
    expect(api.update).not.toHaveBeenCalled();
  });

  it('creates a habit with trimmed values and emits saved', async () => {
    await render();
    api.create.mockReturnValue(of(HABIT));
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    type('input[formcontrolname="name"]', '  Read  ');
    type('input[formcontrolname="startDate"]', '2026-10-01');
    await submit();

    expect(api.create).toHaveBeenCalledWith({
      name: 'Read',
      description: '',
      startDate: '2026-10-01',
    });
    expect(saved).toHaveBeenCalledWith(HABIT);
  });

  it('prefills and updates an existing habit', async () => {
    await render(HABIT);
    api.update.mockReturnValue(of({ ...HABIT, name: 'Read more' }));
    expect(el().querySelector<HTMLInputElement>('input[formcontrolname="name"]')!.value).toBe(
      'Read',
    );
    expect(el().textContent).toContain('Edit habit');

    type('input[formcontrolname="name"]', 'Read more');
    await submit();
    expect(api.update).toHaveBeenCalledWith('h1', {
      name: 'Read more',
      description: '',
      startDate: '2026-10-01',
    });
  });

  it('shows server validation errors on the matching field', async () => {
    await render();
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: {
              error: {
                code: 'START_DATE_AFTER_CHECKINS',
                message: 'Start date cannot be after the first check-in',
                details: [{ path: 'startDate', message: 'Too late' }],
              },
            },
          }),
      ),
    );
    type('input[formcontrolname="name"]', 'Read');
    await submit();
    expect(el().textContent).toContain('Start date cannot be after the first check-in');
    expect(el().textContent).toContain('Too late');
  });

  it('names each field by its label only and links the hint and error through aria-describedby', async () => {
    await render();
    const fields = [
      ['input[formcontrolname="name"]', 'Name'],
      ['textarea[formcontrolname="description"]', 'Description'],
      ['input[formcontrolname="startDate"]', 'Start date'],
    ] as const;
    for (const [selector, label] of fields) {
      const control = el().querySelector<HTMLElement>(selector)!;
      expect(control.closest('label')).toBeNull();
      expect(el().querySelector(`label[for="${control.id}"]`)!.textContent!.trim()).toBe(label);
    }

    const description = el().querySelector<HTMLTextAreaElement>(
      'textarea[formcontrolname="description"]',
    )!;
    expect(description.getAttribute('aria-describedby')).toBe('description-hint');
    expect(el().querySelector('#description-hint')!.textContent).toBe('0/500');

    type('textarea[formcontrolname="description"]', 'y'.repeat(501));
    type('input[formcontrolname="startDate"]', '');
    await submit();
    expect(description.getAttribute('aria-describedby')).toBe('description-hint description-error');
    const startDate = el().querySelector<HTMLInputElement>('input[formcontrolname="startDate"]')!;
    expect(el().querySelector(`#${startDate.getAttribute('aria-describedby')}`)!.textContent).toBe(
      'Start date is required',
    );
  });

  it('moves focus to the first invalid field on submit', async () => {
    await render();
    document.body.appendChild(fixture.nativeElement);
    // jsdom has no showModal(), so open the dialog by hand to make its controls focusable.
    el().querySelector('dialog')!.setAttribute('open', '');
    try {
      el().querySelector<HTMLButtonElement>('button[type="submit"]')!.focus();
      await submit();
      expect(document.activeElement).toBe(el().querySelector('input[formcontrolname="name"]'));

      type('input[formcontrolname="name"]', 'Read');
      type('textarea[formcontrolname="description"]', 'y'.repeat(501));
      el().querySelector<HTMLButtonElement>('button[type="submit"]')!.focus();
      await submit();
      expect(document.activeElement).toBe(
        el().querySelector('textarea[formcontrolname="description"]'),
      );
    } finally {
      fixture.nativeElement.remove();
    }
  });

  it('moves focus to the first invalid field in DOM order when several are invalid', async () => {
    await render();
    document.body.appendChild(fixture.nativeElement);
    el().querySelector('dialog')!.setAttribute('open', '');
    try {
      type('textarea[formcontrolname="description"]', 'y'.repeat(501));
      el().querySelector<HTMLButtonElement>('button[type="submit"]')!.focus();
      await submit();
      expect(el().querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
      expect(document.activeElement).toBe(el().querySelector('input[formcontrolname="name"]'));
    } finally {
      fixture.nativeElement.remove();
    }
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

    el()
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();
    expect(closed).not.toHaveBeenCalled();

    pending.next(HABIT);
    pending.complete();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith(HABIT);
  });

  it('clears the server error banner once the user edits a field', async () => {
    await render();
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 500,
            error: { error: { code: 'INTERNAL', message: 'Server exploded', details: [] } },
          }),
      ),
    );
    type('input[formcontrolname="name"]', 'Read');
    await submit();
    expect(el().querySelector('.alert')!.textContent).toContain('Server exploded');

    type('input[formcontrolname="name"]', 'Read more');
    await fixture.whenStable();
    expect(el().querySelector('.alert')).toBeNull();
  });

  it.each([
    [
      'the × button',
      () => el().querySelector<HTMLButtonElement>('.dialog-header .icon-btn')!.click(),
    ],
    ['Cancel', () => el().querySelector<HTMLButtonElement>('.dialog-footer .btn-ghost')!.click()],
    [
      'Esc',
      () =>
        el()
          .querySelector('dialog')!
          .dispatchEvent(new Event('cancel', { cancelable: true })),
    ],
  ])('emits closed from %s', async (_label, close) => {
    await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    close();
    await fixture.whenStable();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('validDate', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-2-3', '2026-02-28T00:00', 'not a date'])(
    'rejects %s',
    (value) => {
      expect(validDate(new FormControl(value, { nonNullable: true }))).toEqual({ date: true });
    },
  );

  it.each(['', '2026-02-28', '2024-02-29'])('accepts %j', (value) => {
    expect(validDate(new FormControl(value, { nonNullable: true }))).toBeNull();
  });
});
