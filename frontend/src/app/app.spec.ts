import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { AuthStore } from './core/auth-store';
import { MilestoneSocket } from './core/milestone-socket';
import type { User } from './core/models';

const ALICE: User = { id: 'u1', provider: 'google', email: null, displayName: 'Alice Test', avatarUrl: null, timezone: 'UTC' };
const BOB: User = { ...ALICE, id: 'u2', displayName: 'Bob Test' };

describe('App', () => {
  const user = signal<User | null | undefined>(undefined);
  const unreachable = signal(false);
  const retry = vi.fn();
  let fixture: ComponentFixture<App>;
  let socket: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; status: () => string };

  beforeEach(async () => {
    user.set(undefined);
    unreachable.set(false);
    retry.mockClear();
    socket = { connect: vi.fn(), disconnect: vi.fn(), status: () => 'disconnected' };
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user, unreachable, retry, logout: vi.fn() } },
        { provide: MilestoneSocket, useValue: socket },
      ],
    });
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
  });

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
});
