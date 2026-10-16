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

  it('auto-hides success toasts after 5 s but keeps errors and milestones until dismissed', () => {
    toasts.success('Saved');
    toasts.error('Boom');
    toasts.show({ kind: 'milestone', title: '3-day streak!', message: 'Keep going' });
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts().map((t) => t.kind)).toEqual(['error', 'milestone']);
    vi.advanceTimersByTime(60_000);
    expect(toasts.toasts().map((t) => t.kind)).toEqual(['error', 'milestone']);
  });

  it('clears the auto-hide timer when a toast is dismissed', () => {
    toasts.success('Saved');
    toasts.dismiss(toasts.toasts()[0]!.id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses auto-hide and restarts the full delay on resume', () => {
    toasts.success('Saved');
    const id = toasts.toasts()[0]!.id;
    vi.advanceTimersByTime(4000);
    toasts.pause(id);
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);

    toasts.resume(id);
    vi.advanceTimersByTime(4999);
    expect(toasts.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.toasts()).toEqual([]);
  });

  it('never schedules auto-hide for a resumed error, a resumed milestone or a removed toast', () => {
    toasts.error('Boom');
    const errorId = toasts.toasts()[0]!.id;
    toasts.pause(errorId);
    toasts.resume(errorId);
    const id = toasts.show({ kind: 'milestone', title: '3-day streak!', message: 'Keep going' });
    toasts.pause(id);
    toasts.resume(id);
    toasts.resume(999);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not stack a second timer when resumed twice', () => {
    toasts.success('Saved');
    const id = toasts.toasts()[0]!.id;
    toasts.pause(id);
    toasts.resume(id);
    toasts.resume(id);
    expect(vi.getTimerCount()).toBe(1);
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
