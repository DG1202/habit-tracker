import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, type OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, type Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { toApiError } from '../../core/api-error';
import { withoutTodayCheckIn } from '../../core/habit-updates';
import { HabitsApi } from '../../core/habits-api';
import { localToday } from '../../core/local-date';
import type { Habit, HabitStatus, MonthCheckIns } from '../../core/models';
import { ToastService } from '../../core/toast-service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { EmptyState } from '../../shared/empty-state';
import { ErrorBanner } from '../../shared/error-banner';
import { HabitActions } from '../habits/habit-actions';
import { HabitFormDialog } from '../habits/habit-form-dialog';
import { STATUS_LABELS } from '../habits/habit-row';
import { buildMonthGrid } from './month-grid';

@Component({
  selector: 'ht-habit-details-page',
  imports: [RouterLink, EmptyState, ErrorBanner, HabitActions, HabitFormDialog, ConfirmDialog],
  templateUrl: './habit-details-page.html',
  styles: `
    .back { display: inline-block; margin-bottom: var(--space-4); font-size: var(--text-sm); }
    .loading { display: grid; place-items: center; padding: var(--space-7); }
    .details { display: flex; flex-direction: column; gap: var(--space-5); }
    .header { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
    .title { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
    .actions { margin-left: auto; }
    .meta { font-size: var(--text-sm); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
    .stat { padding: var(--space-4); text-align: center; }
    .stat dt { font-size: var(--text-sm); color: var(--color-muted); }
    .stat dd { margin: var(--space-1) 0 0; font-size: 2rem; font-weight: 700; }
    .calendar { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--space-1); }
    .weekday { text-align: center; font-size: var(--text-xs); color: var(--color-muted); font-weight: 600; }
    .day { aspect-ratio: 1; display: grid; place-items: center; border-radius: var(--radius-sm); font-size: var(--text-sm); background: var(--color-bg); }
    .day.checked { background: var(--color-success); color: #fff; font-weight: 700; }
    .day.today { box-shadow: inset 0 0 0 2px var(--color-primary); }
    .day.future { color: #b3bacb; background: transparent; }
    @media (max-width: 600px) { .stat dd { font-size: 1.5rem; } .header, .calendar { padding: var(--space-4); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitDetailsPage implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(HabitsApi);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly habit = signal<Habit | null>(null);
  protected readonly month = signal<MonthCheckIns | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly today = computed(() => this.month()?.today ?? localToday());

  protected readonly weeks = computed(() => {
    const month = this.month();
    return month ? buildMonthGrid(month.month, month.dates, month.today) : [];
  });

  protected readonly monthLabel = computed(() => {
    const month = this.month()?.month;
    return month ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({ habit: this.api.get(this.id()), month: this.api.month(this.id()) })
      .pipe(
        finalize(() => {
          this.loading.set(false);
          this.busy.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ habit, month }) => {
          this.habit.set(habit);
          this.month.set(month);
        },
        error: (err: unknown) => {
          const error = toApiError(err);
          const message = error.status === 404 ? 'This habit does not exist or is not yours.' : error.message;
          // A reload after a mutation keeps the loaded page; only the first load shows the banner.
          if (this.habit()) this.toasts.error(message);
          else this.error.set(message);
        },
      });
  }

  protected checkIn(): void {
    this.mutate(this.api.checkIn(this.id()));
  }

  protected undo(): void {
    const habit = this.habit();
    if (habit) this.mutate(this.api.undoCheckIn(habit.id).pipe(map(() => withoutTodayCheckIn(habit))));
  }

  protected setStatus(status: HabitStatus): void {
    this.mutate(this.api.update(this.id(), { status }));
  }

  protected onSaved(habit: Habit): void {
    this.editing.set(false);
    this.apply(habit);
  }

  protected remove(habit: Habit): void {
    this.confirmingDelete.set(false);
    this.busy.set(true);
    this.api
      .remove(habit.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        complete: () => {
          this.toasts.success(`"${habit.name}" was deleted`);
          void this.router.navigate(['/']);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.toasts.error(toApiError(err).message);
        },
      });
  }

  private mutate(request: Observable<Habit>): void {
    // load() clears busy when the reload settles, so a second click cannot race it.
    this.busy.set(true);
    request.subscribe({
      next: (habit) => this.apply(habit),
      complete: () => this.load(),
      error: (err: unknown) => {
        this.busy.set(false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  private apply(habit: Habit): void {
    this.habit.set(habit);
    this.month.update((month) => {
      if (!month) return month;
      const dates = month.dates.filter((date) => date !== month.today);
      return { ...month, dates: habit.stats.checkedInToday ? [...dates, month.today] : dates };
    });
  }
}
