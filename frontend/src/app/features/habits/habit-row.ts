import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Habit, HabitStatus } from '../../core/models';

export const STATUS_LABELS: Record<HabitStatus, string> = { ACTIVE: 'Active', PAUSED: 'Paused', ARCHIVED: 'Archived' };

@Component({
  selector: 'ht-habit-row',
  imports: [RouterLink],
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
          @if (habit().stats.checkedInToday) {
            <button type="button" class="btn btn-success-soft" [disabled]="busy()" [attr.aria-label]="'Undo today\\'s check-in for ' + habit().name" (click)="undo.emit()">
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

      <div class="habit-actions">
        @switch (habit().status) {
          @case ('ACTIVE') {
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="edit.emit()">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="statusChange.emit('PAUSED')">Pause</button>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="statusChange.emit('ARCHIVED')">Archive</button>
          }
          @case ('PAUSED') {
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="edit.emit()">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="statusChange.emit('ACTIVE')">Resume</button>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="statusChange.emit('ARCHIVED')">Archive</button>
          }
          @case ('ARCHIVED') {
            <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="delete.emit()">Delete</button>
          }
        }
      </div>
    </article>
  `,
  styles: `
    .habit-row {
      display: grid; grid-template-columns: minmax(0, 1fr) 220px 150px 200px; align-items: center;
      gap: var(--space-4); padding: var(--space-4); transition: border-color 120ms, box-shadow 120ms;
    }
    .habit-row:hover { border-color: #cdd3e0; box-shadow: var(--shadow); }
    .habit-row.is-done { border-left: 4px solid var(--color-success); }
    .habit-title { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .habit-name { font-weight: 600; color: var(--color-text); text-decoration: none; }
    .habit-name:hover { color: var(--color-primary); text-decoration: underline; }
    .habit-desc { font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .habit-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: 0; text-align: center; }
    .habit-stats dt { font-size: var(--text-xs); color: var(--color-muted); }
    .habit-stats dd { margin: 0; font-weight: 700; font-size: var(--text-lg); }
    .habit-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-1); }
    .small { font-size: var(--text-sm); }
    @media (max-width: 860px) {
      .habit-row { grid-template-columns: 1fr; gap: var(--space-3); }
      .habit-stats { text-align: left; }
      .habit-today .btn { width: 100%; }
      .habit-actions { justify-content: flex-start; }
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
}
