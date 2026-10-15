import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'milestone' | 'error' | 'success';
  title: string;
  message: string;
  onDismiss?: () => void;
}

const AUTO_HIDE_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly items = signal<Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  show(toast: Omit<Toast, 'id'>): number {
    const id = this.nextId++;
    this.items.update((list) => [...list, { ...toast, id }]);
    // Milestone toasts stay until dismissed so the dismissal can be acknowledged to the server.
    if (toast.kind !== 'milestone') setTimeout(() => this.remove(id), AUTO_HIDE_MS);
    return id;
  }

  success(message: string): void {
    this.show({ kind: 'success', title: 'Done', message });
  }

  error(message: string): void {
    this.show({ kind: 'error', title: 'Something went wrong', message });
  }

  dismiss(id: number): void {
    const toast = this.items().find((item) => item.id === id);
    this.remove(id);
    toast?.onDismiss?.();
  }

  private remove(id: number): void {
    this.items.update((list) => list.filter((item) => item.id !== id));
  }
}
