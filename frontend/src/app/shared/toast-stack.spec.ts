import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from '../core/toast-service';
import { ToastStack } from './toast-stack';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

@Component({
  imports: [ToastStack],
  template: `<main tabindex="-1"><button type="button" id="outside">Outside</button></main><ht-toast-stack />`,
})
class Host {}

describe('ToastStack', () => {
  let fixture: ComponentFixture<Host>;
  let toasts: ToastService;
  const el = () => fixture.nativeElement as HTMLElement;
  const toastEls = () => [...el().querySelectorAll<HTMLElement>('.toast')];
  // Fake timers stall whenStable, so render synchronously.
  const render = () => fixture.detectChanges();
  const dismissButton = (index: number) => toastEls()[index]!.querySelector<HTMLButtonElement>('button')!;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    toasts = TestBed.inject(ToastService);
    render();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.documentElement.style.removeProperty('--toast-stack-h');
  });

  it('makes each toast its own live region: errors assertive, others polite, and no wrapping region', () => {
    toasts.success('Saved');
    toasts.error('Boom');
    toasts.show({ kind: 'milestone', title: '7-day streak!', message: 'Keep going' });
    render();

    const stack = el().querySelector('.toasts')!;
    expect(stack.hasAttribute('aria-live')).toBe(false);
    expect(stack.hasAttribute('role')).toBe(false);
    expect(toastEls().map((toast) => toast.getAttribute('role'))).toEqual(['status', 'alert', 'status']);
    expect(toastEls().map((toast) => toast.hasAttribute('aria-live'))).toEqual([false, false, false]);
  });

  it('dismisses through the button and runs the toast\'s onDismiss', () => {
    const onDismiss = vi.fn();
    toasts.show({ kind: 'milestone', title: '7-day streak!', message: 'Keep going', onDismiss });
    render();

    const button = dismissButton(0);
    expect(button.getAttribute('aria-label')).toBe('Dismiss notification');
    button.click();
    render();
    expect(toastEls()).toHaveLength(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pauses auto-hide while hovered and resumes on leave', () => {
    toasts.success('Saved');
    render();

    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);

    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts()).toEqual([]);
  });

  it('pauses auto-hide while focus is inside a toast, even after the pointer leaves', () => {
    toasts.success('Saved');
    render();

    dismissButton(0).focus();
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);

    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);

    el().querySelector<HTMLButtonElement>('#outside')!.focus();
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts()).toEqual([]);
  });

  it('keeps a toast paused while hovered after focus leaves it', () => {
    toasts.success('Saved');
    render();

    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    dismissButton(0).focus();
    el().querySelector<HTMLButtonElement>('#outside')!.focus();
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);
  });

  it('keeps an error toast until it is dismissed, after hover and focus come and go', () => {
    toasts.error('Boom');
    render();

    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    toastEls()[0]!.dispatchEvent(new MouseEvent('mouseleave'));
    dismissButton(0).focus();
    el().querySelector<HTMLButtonElement>('#outside')!.focus();
    vi.advanceTimersByTime(60_000);
    render();
    expect(toastEls()).toHaveLength(1);

    dismissButton(0).click();
    render();
    expect(toastEls()).toHaveLength(0);
  });

  it('moves focus to the next toast when the focused toast is dismissed, then to <main>', () => {
    toasts.show({ kind: 'milestone', title: 'First', message: 'One' });
    toasts.show({ kind: 'milestone', title: 'Second', message: 'Two' });
    render();

    dismissButton(0).focus();
    dismissButton(0).click();
    render();
    expect(toastEls()).toHaveLength(1);
    expect(document.activeElement).toBe(dismissButton(0));

    dismissButton(0).click();
    render();
    expect(document.activeElement).toBe(el().querySelector('main'));
  });

  it('moves focus to the previous toast when the last focused toast is removed', () => {
    toasts.show({ kind: 'milestone', title: 'First', message: 'One' });
    toasts.show({ kind: 'milestone', title: 'Second', message: 'Two' });
    render();

    dismissButton(1).focus();
    toasts.dismiss(toasts.toasts()[1]!.id);
    render();
    expect(document.activeElement).toBe(dismissButton(0));
  });

  it('still moves focus when the browser fires focusout as the focused toast is removed', () => {
    toasts.show({ kind: 'milestone', title: 'First', message: 'One' });
    toasts.show({ kind: 'milestone', title: 'Second', message: 'Two' });
    render();

    dismissButton(0).focus();
    toasts.dismiss(toasts.toasts()[0]!.id);
    dismissButton(0).dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    render();
    expect(document.activeElement).toBe(dismissButton(0));
  });

  it('leaves focus alone when it already moved elsewhere by the time the focused toast is removed', () => {
    toasts.show({ kind: 'milestone', title: 'First', message: 'One' });
    render();
    dismissButton(0).focus();

    toasts.clear();
    const outside = el().querySelector<HTMLButtonElement>('#outside')!;
    outside.focus();
    render();
    expect(document.activeElement).toBe(outside);
  });

  it('publishes its height as --toast-stack-h and removes it on destroy', () => {
    const observer = FakeResizeObserver.instances[0]!;
    const stack = el().querySelector<HTMLElement>('.toasts')!;
    expect(observer.targets).toEqual([stack]);

    vi.spyOn(stack, 'offsetHeight', 'get').mockReturnValue(150);
    observer.fire();
    expect(document.documentElement.style.getPropertyValue('--toast-stack-h')).toBe('150px');

    fixture.destroy();
    expect(observer.disconnected).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--toast-stack-h')).toBe('');
  });
});
