import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Habit, HabitStatus } from '../../core/models';

/** Status actions shared by the list row and the details page: archived is read-only apart from Delete. */
@Component({
  selector: 'ht-habit-actions',
  template: `
    @switch (habit().status) {
      @case ('ACTIVE') {
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Edit ' + habit().name" (click)="edit.emit()">Edit</button>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Pause ' + habit().name" (click)="statusChange.emit('PAUSED')">Pause</button>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Archive ' + habit().name" (click)="statusChange.emit('ARCHIVED')">Archive</button>
      }
      @case ('PAUSED') {
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Edit ' + habit().name" (click)="edit.emit()">Edit</button>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Resume ' + habit().name" (click)="statusChange.emit('ACTIVE')">Resume</button>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Archive ' + habit().name" (click)="statusChange.emit('ARCHIVED')">Archive</button>
      }
      @case ('ARCHIVED') {
        <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" [attr.aria-label]="'Delete ' + habit().name" (click)="delete.emit()">Delete</button>
      }
    }
  `,
  styles: `:host { display: flex; flex-wrap: wrap; gap: var(--space-1); }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitActions {
  readonly habit = input.required<Habit>();
  readonly busy = input(false);
  readonly edit = output<void>();
  readonly statusChange = output<HabitStatus>();
  readonly delete = output<void>();
}
