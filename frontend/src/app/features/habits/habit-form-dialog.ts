import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  type OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { toApiError } from '../../core/api-error';
import { HabitsApi } from '../../core/habits-api';
import { localToday } from '../../core/local-date';
import type { Habit } from '../../core/models';

type FieldName = 'name' | 'description' | 'startDate';

const notBlank = (control: AbstractControl<string>): ValidationErrors | null => (control.value.trim() ? null : { required: true });

const validDate = (control: AbstractControl<string>): ValidationErrors | null => {
  if (!control.value) return null;
  const parsed = new Date(`${control.value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(control.value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === control.value
    ? null
    : { date: true };
};

const MESSAGES: Record<FieldName, Record<string, string>> = {
  name: { required: 'Name is required', maxlength: 'Name must be at most 80 characters' },
  description: { maxlength: 'Description must be at most 500 characters' },
  startDate: { required: 'Start date is required', date: 'Enter a valid date' },
};

@Component({
  selector: 'ht-habit-form-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './habit-form-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitFormDialog implements OnInit {
  readonly habit = input<Habit | null>(null);
  readonly saved = output<Habit>();
  readonly closed = output<void>();

  private readonly api = inject(HabitsApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly isEdit = computed(() => this.habit() !== null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [notBlank, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(500)]],
    startDate: [localToday(), [Validators.required, validDate]],
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal?.());
  }

  ngOnInit(): void {
    const habit = this.habit();
    if (habit) this.form.setValue({ name: habit.name, description: habit.description, startDate: habit.startDate });
  }

  protected errorFor(field: FieldName): string | null {
    const control = this.form.controls[field];
    if (!control.errors || !(control.touched || this.submitted())) return null;
    if (typeof control.errors['server'] === 'string') return control.errors['server'];
    const key = Object.keys(control.errors)[0];
    return key ? (MESSAGES[field][key] ?? 'Invalid value') : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const raw = this.form.getRawValue();
    const value = { name: raw.name.trim(), description: raw.description.trim(), startDate: raw.startDate };
    const habit = this.habit();
    this.saving.set(true);
    this.serverError.set(null);
    (habit ? this.api.update(habit.id, value) : this.api.create(value))
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (result) => this.saved.emit(result),
        error: (err: unknown) => {
          const error = toApiError(err);
          for (const detail of error.details) {
            this.form.get(detail.path)?.setErrors({ server: detail.message });
          }
          this.serverError.set(error.message);
        },
      });
  }

  protected close(): void {
    if (this.saving()) return;
    this.dialog().nativeElement.close?.();
    this.closed.emit();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
}
