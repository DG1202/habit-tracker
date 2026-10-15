import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly state = signal<User | null | undefined>(undefined);
  private pending: Promise<User | null> | null = null;

  /** `undefined` until the first /api/auth/me call settles. */
  readonly user = this.state.asReadonly();

  ensureLoaded(): Promise<User | null> {
    const current = this.state();
    if (current !== undefined) return Promise.resolve(current);
    this.pending ??= this.load().finally(() => (this.pending = null));
    return this.pending;
  }

  clear(): void {
    this.state.set(null);
  }

  logout(): void {
    const done = () => {
      this.state.set(null);
      void this.router.navigate(['/login']);
    };
    this.http.post('/api/auth/logout', {}).subscribe({ complete: done, error: done });
  }

  private async load(): Promise<User | null> {
    try {
      const user = await firstValueFrom(this.http.get<User>('/api/auth/me'));
      const synced = await this.syncTimezone(user);
      this.state.set(synced);
      return synced;
    } catch {
      this.state.set(null);
      return null;
    }
  }

  private async syncTimezone(user: User): Promise<User> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone || timezone === user.timezone) return user;
    try {
      await firstValueFrom(this.http.put('/api/me/timezone', { timezone }));
      return { ...user, timezone };
    } catch {
      return user;
    }
  }
}
