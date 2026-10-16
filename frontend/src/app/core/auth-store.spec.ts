import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from './auth-store';
import type { User } from './models';
import { ToastService } from './toast-service';

const USER: User = {
  id: 'u1',
  provider: 'github',
  email: null,
  displayName: 'Alice Test',
  avatarUrl: null,
  timezone: 'UTC',
};

describe('AuthStore', () => {
  let auth: AuthStore;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'UTC',
    } as Intl.ResolvedDateTimeFormatOptions);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  const flushMe = (body: string | object | null, init?: { status: number; statusText: string }) =>
    http.expectOne('/api/auth/me').flush(body, init);

  it('loads the user once for concurrent callers', async () => {
    const first = auth.ensureLoaded();
    const second = auth.ensureLoaded();
    flushMe(USER);
    expect(await first).toEqual(USER);
    expect(await second).toEqual(USER);
    expect(await auth.ensureLoaded()).toEqual(USER);
    expect(auth.user()).toEqual(USER);
  });

  it('treats a 401 as signed out and caches it', async () => {
    const result = auth.ensureLoaded();
    flushMe(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in required', details: [] } },
      { status: 401, statusText: 'Unauthorized' },
    );
    expect(await result).toBeNull();
    expect(auth.user()).toBeNull();
    expect(auth.unreachable()).toBe(false);
    expect(await auth.ensureLoaded()).toBeNull();
  });

  it.each([
    ['a 500', { status: 500, statusText: 'Error' }],
    ['a 502 from the proxy', { status: 502, statusText: 'Bad Gateway' }],
  ])('does not cache a signed-out state after %s', async (_label, init) => {
    const result = auth.ensureLoaded();
    flushMe('<html>', init);
    expect(await result).toBeUndefined();
    expect(auth.user()).toBeUndefined();

    const retried = auth.ensureLoaded();
    flushMe(USER);
    expect(await retried).toEqual(USER);
  });

  it('does not cache a signed-out state after a network error', async () => {
    const result = auth.ensureLoaded();
    http.expectOne('/api/auth/me').error(new ProgressEvent('error'));
    expect(await result).toBeUndefined();
    expect(auth.user()).toBeUndefined();
    auth.ensureLoaded();
    flushMe(USER);
  });

  it('remembers the blocked URL and retries it', () => {
    auth.markUnreachable('/habits/h1');
    expect(auth.unreachable()).toBe(true);

    auth.retry();
    expect(auth.unreachable()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/habits/h1');
  });

  it('hides the unreachable state once the server answers', async () => {
    auth.markUnreachable('/');
    const result = auth.ensureLoaded();
    flushMe(USER);
    await result;
    expect(auth.unreachable()).toBe(false);
  });

  it('syncs the browser timezone when it differs', async () => {
    vi.mocked(Intl.DateTimeFormat.prototype.resolvedOptions).mockReturnValue({
      timeZone: 'Europe/Kyiv',
    } as Intl.ResolvedDateTimeFormatOptions);
    const result = auth.ensureLoaded();
    flushMe(USER);
    await Promise.resolve();
    const put = http.expectOne('/api/me/timezone');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ timezone: 'Europe/Kyiv' });
    put.flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toEqual({ ...USER, timezone: 'Europe/Kyiv' });
  });

  it('keeps the stored timezone when the sync fails', async () => {
    vi.mocked(Intl.DateTimeFormat.prototype.resolvedOptions).mockReturnValue({
      timeZone: 'Europe/Kyiv',
    } as Intl.ResolvedDateTimeFormatOptions);
    const result = auth.ensureLoaded();
    flushMe(USER);
    await Promise.resolve();
    http.expectOne('/api/me/timezone').flush(null, { status: 500, statusText: 'Error' });
    expect(await result).toEqual(USER);
  });

  it('drops its session-ended subscription when the request completes', () => {
    const request = new Subject<void>();
    request.pipe(auth.endWithSession()).subscribe();
    expect(auth['sessionEnded'].observed).toBe(true);
    request.complete();
    expect(auth['sessionEnded'].observed).toBe(false);
  });

  async function signIn() {
    const loaded = auth.ensureLoaded();
    flushMe(USER);
    await loaded;
  }

  it.each([
    ['a 2xx', 204, 'No Content'],
    ['a 401 (the session is already gone)', 401, 'Unauthorized'],
  ])('signs out and goes to /login when logout returns %s', async (_label, status, statusText) => {
    await signIn();
    auth.logout();
    http.expectOne('/api/auth/logout').flush(null, { status, statusText });
    expect(auth.user()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it.each([
    [
      'a 403 (origin check)',
      (req: TestRequest) => req.flush(null, { status: 403, statusText: 'Forbidden' }),
    ],
    [
      'a 429 (rate limit)',
      (req: TestRequest) => req.flush(null, { status: 429, statusText: 'Too Many Requests' }),
    ],
    ['a 5xx', (req: TestRequest) => req.flush(null, { status: 502, statusText: 'Bad Gateway' })],
    ['a network error', (req: TestRequest) => req.error(new ProgressEvent('error'))],
  ])('stays signed in and shows an error toast when logout fails with %s', async (_label, fail) => {
    await signIn();
    auth.logout();
    fail(http.expectOne('/api/auth/logout'));
    expect(auth.user()).toEqual(USER);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).toasts()).toEqual([
      expect.objectContaining({ kind: 'error', message: "Couldn't sign out. Try again." }),
    ]);
  });
});
