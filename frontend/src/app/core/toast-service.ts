import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'milestone' | 'error' | 'success';
  title: string;
  message: string;
  onDismiss?: () => void;
}

const AUTO_HIDE_MS = 5000;

// Errors stay so they can be read (WCAG 2.2.1); milestones stay so their dismissal is acknowledged.
const autoHides = (toast: Pick<Toast, 'kind'>) => toast.kind === 'success';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly items = signal<Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = this.items.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.timers.forEach((timer) => clearTimeout(timer));
      this.timers.clear();
    });
  }

  show(toast: Omit<Toast, 'id'>): number {
    const id = this.nextId++;
    this.items.update((list) => [...list, { ...toast, id }]);
    if (autoHides(toast)) this.scheduleHide(id);
    return id;
  }

  pause(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  resume(id: number): void {
    const toast = this.items().find((item) => item.id === id);
    if (toast && autoHides(toast) && !this.timers.has(id)) this.scheduleHide(id);
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

  clear(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.items.set([]);
  }

  private scheduleHide(id: number): void {
    this.timers.set(id, setTimeout(() => this.remove(id), AUTO_HIDE_MS));
  }

  private remove(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.items.update((list) => list.filter((item) => item.id !== id));
  }
}
