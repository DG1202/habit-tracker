import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideRouter, Router, UrlTree } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthStore } from './auth-store';
import { authGuard, guestGuard } from './auth-guards';
import type { User } from './models';

const USER: User = { id: 'u1', provider: 'google', email: null, displayName: 'Alice Test', avatarUrl: null, timezone: 'UTC' };

let markUnreachable: ReturnType<typeof vi.fn>;

function run(guard: typeof authGuard, user: User | null | undefined, url = '/') {
  markUnreachable = vi.fn();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: { ensureLoaded: () => Promise.resolve(user), markUnreachable } }],
  });
  return TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;
}

describe('auth guards', () => {
  it('sends anonymous users to /login', async () => {
    const result = await run(authGuard, null);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('lets signed-in users through', async () => {
    expect(await run(authGuard, USER)).toBe(true);
  });

  it('lets anonymous users reach /login', async () => {
    expect(await run(guestGuard, null)).toBe(true);
  });

  it('keeps signed-in users away from /login', async () => {
    const result = await run(guestGuard, USER);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it.each([
    ['authGuard', authGuard],
    ['guestGuard', guestGuard],
  ])('%s blocks navigation and records the URL when the server is unreachable', async (_name, guard) => {
    expect(await run(guard, undefined, '/habits/h1')).toBe(false);
    expect(markUnreachable).toHaveBeenCalledWith('/habits/h1');
  });
});
