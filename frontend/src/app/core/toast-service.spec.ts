import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from './toast-service';

describe('ToastService', () => {
  let toasts: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('auto-hides success and error toasts after 5 s but keeps milestones', () => {
    toasts.success('Saved');
    toasts.show({ kind: 'milestone', title: '3-day streak!', message: 'Keep going' });
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts().map((t) => t.kind)).toEqual(['milestone']);
  });

  it('clears the auto-hide timer when a toast is dismissed', () => {
    toasts.error('Boom');
    toasts.dismiss(toasts.toasts()[0]!.id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears every toast and its timer', () => {
    toasts.success('Saved');
    toasts.error('Boom');
    toasts.show({ kind: 'milestone', title: '3-day streak!', message: 'Keep going' });
    toasts.clear();
    expect(toasts.toasts()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending timers when the service is destroyed', () => {
    toasts.success('One');
    toasts.success('Two');
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });
});
