import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { restoreFocusOnDestroy } from './restore-focus';

@Component({
  selector: 'ht-confirm-dialog',
  template: `
    <dialog #dialog class="dialog" aria-labelledby="confirm-title" (cancel)="$event.preventDefault(); cancelled.emit()" (click)="onClick($event)">
      <div class="dialog-body">
        <h2 id="confirm-title">{{ title() }}</h2>
        <p class="muted">{{ message() }}</p>
        <div class="dialog-footer">
          <button type="button" class="btn btn-ghost" (click)="cancelled.emit()">Cancel</button>
          <button type="button" class="btn btn-primary" [class.danger]="danger()" (click)="confirmed.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </dialog>
  `,
  styles: `
    p { overflow-wrap: anywhere; }
    .danger { background: var(--color-danger); border-color: var(--color-danger); }
    .danger:hover:not(:disabled) { background: var(--color-danger-hover); border-color: var(--color-danger-hover); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly danger = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal?.());
    restoreFocusOnDestroy();
  }

  protected onClick(event: MouseEvent): void {
    // The body fills the dialog, so only a backdrop click targets the <dialog> itself.
    if (event.target === this.dialog().nativeElement) this.cancelled.emit();
  }
}
