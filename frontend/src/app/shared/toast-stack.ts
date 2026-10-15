import { afterNextRender, afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, ElementRef, inject, viewChild } from '@angular/core';
import { ToastService } from '../core/toast-service';

@Component({
  selector: 'ht-toast-stack',
  template: `
    <div #stack class="toasts">
      @for (toast of toastService.toasts(); track toast.id; let index = $index) {
        <div
          class="toast card"
          [attr.data-kind]="toast.kind"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
          (mouseenter)="onPointer(toast.id, true)"
          (mouseleave)="onPointer(toast.id, false)"
          (focusin)="onFocusIn(toast.id, index)"
          (focusout)="onFocusOut($event, toast.id)"
        >
          <span class="toast-icon" aria-hidden="true">{{ toast.kind === 'milestone' ? '🏆' : toast.kind === 'error' ? '⚠️' : '✓' }}</span>
          <div class="toast-text">
            <strong>{{ toast.title }}</strong>
            <span>{{ toast.message }}</span>
          </div>
          <button type="button" class="icon-btn" aria-label="Dismiss notification" (click)="toastService.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; bottom: var(--space-4); right: var(--space-4); z-index: 1000; display: flex; flex-direction: column; gap: var(--space-2); width: min(380px, calc(100vw - 2 * var(--space-4))); max-height: 50dvh; overflow-y: auto; overscroll-behavior: contain; }
    @media (max-width: 600px) { .toasts { left: var(--space-4); width: auto; } }
    .toast { display: flex; flex-shrink: 0; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); box-shadow: var(--shadow); animation: slide-in 180ms ease-out; border-left: 4px solid var(--color-primary); }
    .toast[data-kind='error'] { border-left-color: var(--color-danger); }
    .toast[data-kind='success'] { border-left-color: var(--color-success); }
    .toast[data-kind='milestone'] { border-left-color: var(--color-milestone); background: var(--color-milestone-soft); }
    .toast-icon { font-size: 1.25rem; }
    .toast-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--text-sm); overflow-wrap: anywhere; }
    @keyframes slide-in { from { opacity: 0; transform: translateY(8px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastStack {
  protected readonly toastService = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly stack = viewChild.required<ElementRef<HTMLElement>>('stack');
  private readonly hovered = new Set<number>();
  private focused: { id: number; index: number } | null = null;

  constructor() {
    const root = this.document.documentElement;
    const destroyRef = inject(DestroyRef);
    // Pages reserve this much bottom space so the stack never hides focused content or the last rows.
    afterNextRender(() => {
      const stack = this.stack().nativeElement;
      const observer = new ResizeObserver(() => root.style.setProperty('--toast-stack-h', `${stack.offsetHeight}px`));
      observer.observe(stack);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        root.style.removeProperty('--toast-stack-h');
      });
    });
    afterRenderEffect(() => {
      const toasts = this.toastService.toasts();
      const focused = this.focused;
      if (!focused || toasts.some((toast) => toast.id === focused.id)) return;
      this.focused = null;
      const active = this.document.activeElement;
      if (active && active !== this.document.body) return;
      const buttons = this.stack().nativeElement.querySelectorAll<HTMLElement>('.toast .icon-btn');
      (buttons[focused.index] ?? buttons[focused.index - 1] ?? this.document.querySelector<HTMLElement>('main'))?.focus();
    });
  }

  protected onPointer(id: number, inside: boolean): void {
    if (inside) {
      this.hovered.add(id);
      this.toastService.pause(id);
    } else {
      this.hovered.delete(id);
      if (this.focused?.id !== id) this.toastService.resume(id);
    }
  }

  protected onFocusIn(id: number, index: number): void {
    this.focused = { id, index };
    this.toastService.pause(id);
  }

  protected onFocusOut(event: FocusEvent, id: number): void {
    const toast = event.currentTarget as HTMLElement;
    if (toast.contains(event.relatedTarget as Node | null)) return;
    // A removed toast keeps its focus record so the render effect can move focus somewhere sensible.
    if (!this.toastService.toasts().some((item) => item.id === id)) return;
    this.focused = null;
    if (!this.hovered.has(id)) this.toastService.resume(id);
  }
}
