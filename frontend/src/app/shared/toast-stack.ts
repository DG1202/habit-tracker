import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast-service';

@Component({
  selector: 'ht-toast-stack',
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast card" [attr.data-kind]="toast.kind" [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
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
    .toasts { position: fixed; top: var(--space-4); right: var(--space-4); z-index: 1000; display: flex; flex-direction: column; gap: var(--space-2); width: min(380px, calc(100vw - 2 * var(--space-4))); }
    .toast { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); box-shadow: var(--shadow); animation: slide-in 180ms ease-out; border-left: 4px solid var(--color-primary); }
    .toast[data-kind='error'] { border-left-color: var(--color-danger); }
    .toast[data-kind='success'] { border-left-color: var(--color-success); }
    .toast[data-kind='milestone'] { border-left-color: #f59e0b; background: #fffbeb; }
    .toast-icon { font-size: 1.25rem; }
    .toast-text { flex: 1; display: flex; flex-direction: column; font-size: var(--text-sm); }
    @keyframes slide-in { from { opacity: 0; transform: translateY(-8px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastStack {
  protected readonly toastService = inject(ToastService);
}
