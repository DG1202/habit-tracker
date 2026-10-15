import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { AuthStore } from './core/auth-store';
import { MilestoneSocket } from './core/milestone-socket';
import type { User } from './core/models';

const ALICE: User = {
  id: 'u1',
  provider: 'google',
  email: null,
  displayName: 'Alice Test',
  avatarUrl: null,
  timezone: 'UTC',
};
const BOB: User = { ...ALICE, id: 'u2', displayName: 'Bob Test' };

@Component({ template: '<button type="button">Page action</button>' })
class Blank {}

describe('App', () => {
  const user = signal<User | null | undefined>(undefined);
  const unreachable = signal(false);
  const retry = vi.fn();
  let fixture: ComponentFixture<App>;
  let socket: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    status: () => string;
  };

  beforeEach(async () => {
    user.set(undefined);
    unreachable.set(false);
    retry.mockClear();
    socket = { connect: vi.fn(), disconnect: vi.fn(), status: () => 'disconnected' };
    // jsdom has no ResizeObserver; ToastStack needs one.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'next', component: Blank },
        ]),
        { provide: AuthStore, useValue: { user, unreachable, retry, logout: vi.fn() } },
        { provide: MilestoneSocket, useValue: socket },
      ],
    });
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('connects the socket for the signed-in user and disconnects when the user becomes null', async () => {
    expect(socket.connect).not.toHaveBeenCalled();

    user.set(ALICE);
    await fixture.whenStable();
    expect(socket.connect).toHaveBeenLastCalledWith('u1');

    socket.disconnect.mockClear();
    user.set(null);
    await fixture.whenStable();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('passes the new user id when the user changes without signing out', async () => {
    user.set(ALICE);
    await fixture.whenStable();
    user.set(BOB);
    await fixture.whenStable();
    expect(socket.connect).toHaveBeenLastCalledWith('u2');
  });

  it('shows a "Cannot reach the server" banner with Retry when the session check fails', async () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('ht-error-banner')).toBeNull();

    unreachable.set(true);
    await fixture.whenStable();
    expect(root.textContent).toContain('Cannot reach the server');
    root.querySelector<HTMLButtonElement>('ht-error-banner button')!.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the main region when Retry removes the banner', async () => {
    const root = fixture.nativeElement as HTMLElement;
    retry.mockImplementation(() => unreachable.set(false));
    unreachable.set(true);
    await fixture.whenStable();
    const retryButton = root.querySelector<HTMLButtonElement>('ht-error-banner button')!;
    retryButton.focus();
    retryButton.click();
    await fixture.whenStable();

    expect(root.querySelector('ht-error-banner')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('main'));
  });

  it('moves focus to <main> after a route change, but not on the first navigation', async () => {
    const root = fixture.nativeElement as HTMLElement;
    document.body.appendChild(root);
    const router = TestBed.inject(Router);
    try {
      await router.navigateByUrl('/');
      await fixture.whenStable();
      expect(document.activeElement).toBe(document.body);

      root.querySelector<HTMLButtonElement>('main button')!.focus();
      await router.navigateByUrl('/next');
      await fixture.whenStable();
      expect(document.activeElement).toBe(root.querySelector('main'));
    } finally {
      root.remove();
    }
  });
});
