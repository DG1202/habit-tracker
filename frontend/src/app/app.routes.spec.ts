import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Observable } from 'rxjs';
import { routes } from './app.routes';
import { AuthStore } from './core/auth-store';
import type { User } from './core/models';

const USER: User = {
  id: 'u1',
  provider: 'github',
  email: null,
  displayName: 'Alice Test',
  avatarUrl: null,
  timezone: 'UTC',
};

describe('app routes', () => {
  async function titleAt(url: string, user: User | null): Promise<string> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: {
            user: () => user,
            ensureLoaded: () => Promise.resolve(user),
            markUnreachable: () => undefined,
            endWithSession: () => (source: Observable<unknown>) => source,
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Title).getTitle();
  }

  it.each([
    ['/login', null, 'Sign in · Habit Tracker'],
    ['/', USER, 'My habits · Habit Tracker'],
    ['/habits/h1', USER, 'Habit details · Habit Tracker'],
  ])('titles %s', async (url, user, title) => {
    expect(await titleAt(url, user)).toBe(title);
  });
});
