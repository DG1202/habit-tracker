import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { localToday } from '../../core/local-date';
import type { Habit, HabitStatus } from '../../core/models';
import { HabitActions } from './habit-actions';

export const STATUS_LABELS: Record<HabitStatus, string> = { ACTIVE: 'Active', PAUSED: 'Paused', ARCHIVED: 'Archived' };

@Component({
  selector: 'ht-habit-row',
  imports: [RouterLink, HabitActions],
  template: `
    <article class="habit-row card" [class.is-done]="habit().stats.checkedInToday">
      <div class="habit-main">
        <div class="habit-title">
          <a class="habit-name" [routerLink]="['/habits', habit().id]">{{ habit().name }}</a>
          <span class="badge" [attr.data-status]="habit().status">{{ statusLabels[habit().status] }}</span>
        </div>
        @if (habit().description) {
          <p class="habit-desc muted">{{ habit().description }}</p>
        }
      </div>

      <dl class="habit-stats">
        <div><dt>Current</dt><dd>🔥 {{ habit().stats.currentStreak }}</dd></div>
        <div><dt>Best</dt><dd>{{ habit().stats.bestStreak }}</dd></div>
        <div><dt>Total</dt><dd>{{ habit().stats.totalCheckIns }}</dd></div>
      </dl>

      <div class="habit-today">
        @if (habit().status === 'ACTIVE') {
          @if (notStarted()) {
            <button type="button" class="btn" disabled>Starts on {{ habit().startDate }}</button>
          } @else if (habit().stats.checkedInToday) {
            <button type="button" class="btn btn-success-soft" [disabled]="busy()" [attr.aria-label]="'Done today. Undo check-in for ' + habit().name" (click)="undo.emit()">
              ✓ Done · Undo
            </button>
          } @else {
            <button type="button" class="btn btn-primary" [disabled]="busy()" [attr.aria-label]="'Check in ' + habit().name + ' for today'" (click)="checkIn.emit()">
              Check in
            </button>
          }
        } @else {
          <span class="muted small">{{ habit().status === 'PAUSED' ? 'Paused' : 'Read-only' }}</span>
        }
      </div>

      <ht-habit-actions
        class="habit-actions"
        [habit]="habit()"
        [busy]="busy()"
        (edit)="edit.emit()"
        (statusChange)="statusChange.emit($event)"
        (delete)="delete.emit()"
      />
    </article>
  `,
  styles: `
    .habit-row {
      display: grid; grid-template-columns: minmax(0, 1fr) 220px 150px auto; align-items: center;
      gap: var(--space-4); padding: var(--space-4); transition: border-color 120ms, box-shadow 120ms;
    }
    .habit-row:hover { border-color: var(--color-border-strong); box-shadow: var(--shadow); }
    .habit-row.is-done { border-left: 4px solid var(--color-success); }
    .habit-title { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .habit-name { font-weight: 600; color: var(--color-text); text-decoration: none; }
    .habit-name:hover { color: var(--color-primary); text-decoration: underline; }
    .habit-desc { font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .habit-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: 0; text-align: center; }
    .habit-stats dt { font-size: var(--text-xs); color: var(--color-muted); }
    .habit-stats dd { margin: 0; font-weight: 700; font-size: var(--text-lg); }
    .habit-actions { justify-content: flex-end; flex-wrap: nowrap; }
    .small { font-size: var(--text-sm); }
    @media (max-width: 860px) {
      .habit-row { grid-template-columns: 1fr; gap: var(--space-3); }
      .habit-stats { text-align: left; }
      .habit-today .btn { width: 100%; }
      .habit-actions { justify-content: flex-start; flex-wrap: wrap; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitRow {
  readonly habit = input.required<Habit>();
  readonly busy = input(false);
  readonly checkIn = output<void>();
  readonly undo = output<void>();
  readonly edit = output<void>();
  readonly statusChange = output<HabitStatus>();
  readonly delete = output<void>();
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly notStarted = computed(() => this.habit().startDate > localToday());
}
