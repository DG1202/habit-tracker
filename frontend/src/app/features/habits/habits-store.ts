import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { merge, of, Subject, type Observable } from 'rxjs';
import { catchError, debounceTime, map, switchMap } from 'rxjs/operators';
import { toApiError } from '../../core/api-error';
import { HabitsApi } from '../../core/habits-api';
import type { Habit, HabitQuery, HabitStatus } from '../../core/models';
import { ToastService } from '../../core/toast-service';

const EMPTY_QUERY: HabitQuery = { q: '', status: '', today: '' };

@Injectable()
export class HabitsStore {
  private readonly api = inject(HabitsApi);
  private readonly toasts = inject(ToastService);
  private readonly reload$ = new Subject<void>();
  private readonly awaitingReload = new Set<string>();

  readonly query = signal<HabitQuery>(EMPTY_QUERY);
  readonly habits = signal<Habit[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busyIds = signal<ReadonlySet<string>>(new Set());
  readonly hasFilters = computed(() => {
    const query = this.query();
    return Boolean(query.q.trim() || query.status || query.today);
  });

  constructor() {
    merge(toObservable(this.query).pipe(debounceTime(250)), this.reload$.pipe(map(() => this.query())))
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          this.error.set(null);
          return this.api.list(query).pipe(
            catchError((err: unknown) => {
              this.error.set(toApiError(err).message);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((habits) => {
        if (habits) this.habits.set(habits);
        this.loading.set(false);
        this.awaitingReload.forEach((id) => this.setBusy(id, false));
        this.awaitingReload.clear();
      });
  }

  patchQuery(patch: Partial<HabitQuery>): void {
    this.query.update((query) => ({ ...query, ...patch }));
  }

  clearFilters(): void {
    this.query.set(EMPTY_QUERY);
  }

  reload(): void {
    this.reload$.next();
  }

  checkIn(habit: Habit): void {
    this.run(habit.id, this.api.checkIn(habit.id));
  }

  undo(habit: Habit): void {
    this.run(habit.id, this.api.undoCheckIn(habit.id));
  }

  setStatus(habit: Habit, status: HabitStatus): void {
    this.run(habit.id, this.api.update(habit.id, { status }));
  }

  remove(habit: Habit): void {
    this.run(habit.id, this.api.remove(habit.id), `"${habit.name}" was deleted`);
  }

  private run(id: string, request: Observable<unknown>, successMessage?: string): void {
    this.setBusy(id, true);
    request.subscribe({
      complete: () => {
        if (successMessage) this.toasts.success(successMessage);
        // Stay busy until the list reflects the change, or a second click would hit a 409/404.
        this.awaitingReload.add(id);
        this.reload();
      },
      error: (err: unknown) => {
        this.setBusy(id, false);
        this.toasts.error(toApiError(err).message);
      },
    });
  }

  private setBusy(id: string, busy: boolean): void {
    this.busyIds.update((ids) => {
      const next = new Set(ids);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
