import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { HabitQuery } from '../../core/models';

@Component({
  selector: 'ht-habit-filters',
  template: `
    <div class="filters card">
      <label class="search">
        <span class="visually-hidden">Search habits</span>
        <input class="input" type="search" placeholder="Search by name or description…" maxlength="100" [value]="query().q" (input)="onSearch($event)" />
      </label>
      <div class="chips" role="group" aria-label="Filter by status">
        @for (option of statusOptions; track option.value) {
          <button type="button" class="chip" [attr.aria-pressed]="query().status === option.value" (click)="queryChange.emit({ status: option.value })">
            {{ option.label }}
          </button>
        }
      </div>
      <div class="chips" role="group" aria-label="Filter by today's check-in">
        @for (option of todayOptions; track option.value) {
          <button type="button" class="chip" [attr.aria-pressed]="query().today === option.value" (click)="queryChange.emit({ today: option.value })">
            {{ option.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-3); margin-bottom: var(--space-4); }
    .search { flex: 1 1 260px; display: flex; }
    .search .input { width: 100%; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitFilters {
  readonly query = input.required<HabitQuery>();
  readonly queryChange = output<Partial<HabitQuery>>();

  protected readonly statusOptions = [
    { value: '', label: 'All' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'PAUSED', label: 'Paused' },
    { value: 'ARCHIVED', label: 'Archived' },
  ] as const;

  protected readonly todayOptions = [
    { value: '', label: 'Any day' },
    { value: 'done', label: 'Done today' },
    { value: 'not_done', label: 'Not done today' },
  ] as const;

  protected onSearch(event: Event): void {
    this.queryChange.emit({ q: (event.target as HTMLInputElement).value });
  }
}
