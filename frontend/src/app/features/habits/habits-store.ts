import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { merge, of, Subject, timer, type Observable } from 'rxjs';
import { catchError, debounce, map, switchMap } from 'rxjs/operators';
import { toApiError } from '../../core/api-error';
import { withoutTodayCheckIn } from '../../core/habit-updates';
import { HabitsApi } from '../../core/habits-api';
import type { Habit, HabitQuery, HabitStatus } from '../../core/models';
import { ToastService } from '../../core/toast-service';

const EMPTY_QUERY: HabitQuery = { q: '', status: '', today: '' };
const SEARCH_DEBOUNCE_MS = 250;

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
    let lastSearch = this.query().q;
    const queries = toObservable(this.query).pipe(
      // Only typing is debounced; chips and clearing the search apply at once.
      debounce((query) => {
        const typing = query.q !== lastSearch && query.q !== '';
        lastSearch = query.q;
        return typing ? timer(SEARCH_DEBOUNCE_MS) : of(0);
      }),
    );
    merge(queries, this.reload$.pipe(map(() => this.query())))
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          this.error.set(null);
          return this.api.list(query).pipe(
            catchError((err: unknown) => {
              const message = toApiError(err).message;
              // A failed reload after an action keeps the list, which already shows the action's result.
              if (this.awaitingReload.size > 0 && this.habits().length > 0) this.toasts.error(message);
              else this.error.set(message);
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
    this.run(habit.id, this.api.undoCheckIn(habit.id).pipe(map(() => withoutTodayCheckIn(habit))));
  }

  setStatus(habit: Habit, status: HabitStatus): void {
    this.run(habit.id, this.api.update(habit.id, { status }));
  }

  remove(habit: Habit): void {
    this.run(habit.id, this.api.remove(habit.id), `"${habit.name}" was deleted`);
  }

  private run(id: string, request: Observable<Habit | void>, successMessage?: string): void {
    this.setBusy(id, true);
    request.subscribe({
      next: (updated) => {
        if (updated) this.habits.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      },
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
