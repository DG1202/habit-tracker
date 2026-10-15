import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { merge, of, Subject, timer, type Observable } from 'rxjs';
import { catchError, debounce, map, switchMap, tap } from 'rxjs/operators';
import { toApiError } from '../../core/api-error';
import { HabitsApi } from '../../core/habits-api';
import type { Habit, HabitQuery, HabitStatus } from '../../core/models';
import { ToastService } from '../../core/toast-service';

const EMPTY_QUERY: HabitQuery = { q: '', status: '', today: '' };
const SEARCH_DEBOUNCE_MS = 250;

const sameQuery = (a: HabitQuery, b: HabitQuery) => a.q === b.q && a.status === b.status && a.today === b.today;

@Injectable()
export class HabitsStore {
  private readonly api = inject(HabitsApi);
  private readonly toasts = inject(ToastService);
  private readonly reload$ = new Subject<void>();
  private readonly awaitingReload = new Set<string>();
  private shownQuery: HabitQuery | null = null;

  private readonly queryState = signal<HabitQuery>(EMPTY_QUERY);
  private readonly habitsState = signal<Habit[]>([]);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);
  private readonly busyState = signal<ReadonlySet<string>>(new Set());

  readonly query = this.queryState.asReadonly();
  readonly habits = this.habitsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busyIds = this.busyState.asReadonly();
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
          this.loadingState.set(true);
          this.errorState.set(null);
          return this.api.list(query).pipe(
            tap(() => (this.shownQuery = query)),
            catchError((err: unknown) => {
              const message = toApiError(err).message;
              // Keep the rows only when they match the selected filters and already show the action's result.
              const rowsMatchQuery = this.shownQuery !== null && sameQuery(this.shownQuery, query);
              if (this.awaitingReload.size > 0 && this.habits().length > 0 && rowsMatchQuery) this.toasts.error(message);
              else this.errorState.set(message);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((habits) => {
        if (habits) this.habitsState.set(habits);
        this.loadingState.set(false);
        this.awaitingReload.forEach((id) => this.setBusy(id, false));
        this.awaitingReload.clear();
      });
  }

  patchQuery(patch: Partial<HabitQuery>): void {
    this.queryState.update((query) => ({ ...query, ...patch }));
  }

  clearFilters(): void {
    this.queryState.set(EMPTY_QUERY);
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

  private run(id: string, request: Observable<Habit | void>, successMessage?: string): void {
    // [disabled] only applies on the next render, so a fast second click still reaches here.
    if (this.busyIds().has(id)) return;
    this.setBusy(id, true);
    request.subscribe({
      next: (updated) => {
        if (updated) this.habitsState.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
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
    this.busyState.update((ids) => {
      const next = new Set(ids);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
