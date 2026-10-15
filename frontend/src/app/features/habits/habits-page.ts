import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Habit } from '../../core/models';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { EmptyState } from '../../shared/empty-state';
import { ErrorBanner } from '../../shared/error-banner';
import { HabitFilters } from './habit-filters';
import { HabitFormDialog } from './habit-form-dialog';
import { HabitRow } from './habit-row';
import { HabitsStore } from './habits-store';

@Component({
  selector: 'ht-habits-page',
  imports: [HabitFilters, HabitRow, EmptyState, ErrorBanner, ConfirmDialog, HabitFormDialog],
  providers: [HabitsStore],
  templateUrl: './habits-page.html',
  styles: `
    .page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-5); flex-wrap: wrap; }
    .habit-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); transition: opacity 150ms; }
    .habit-list.is-refreshing { opacity: 0.6; }
    .skeleton-row { height: 84px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitsPage {
  protected readonly store = inject(HabitsStore);
  protected readonly editing = signal<Habit | 'new' | null>(null);
  protected readonly deleting = signal<Habit | null>(null);
  protected readonly skeletons = [1, 2, 3];

  protected readonly editHabit = computed(() => {
    const editing = this.editing();
    return editing === 'new' ? null : editing;
  });

  protected onSaved(): void {
    this.editing.set(null);
    this.store.reload();
  }

  protected confirmDelete(): void {
    const habit = this.deleting();
    if (habit) this.store.remove(habit);
    this.deleting.set(null);
  }
}
