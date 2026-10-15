import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly state = signal<User | null | undefined>(undefined);
  private readonly blockedUrl = signal<string | null>(null);
  private pending: Promise<User | null | undefined> | null = null;

  /** `undefined` until /api/auth/me answers with a user or a 401. */
  readonly user = this.state.asReadonly();
  readonly unreachable = computed(() => this.blockedUrl() !== null);

  /** Resolves `undefined` when the server could not be reached; that result is not cached. */
  ensureLoaded(): Promise<User | null | undefined> {
    const current = this.state();
    if (current !== undefined) return Promise.resolve(current);
    this.pending ??= this.load().finally(() => (this.pending = null));
    return this.pending;
  }

  markUnreachable(url: string): void {
    this.blockedUrl.set(url);
  }

  retry(): void {
    const url = this.blockedUrl() ?? '/';
    this.blockedUrl.set(null);
    void this.router.navigateByUrl(url);
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

  private async load(): Promise<User | null | undefined> {
    let user: User;
    try {
      user = await firstValueFrom(this.http.get<User>('/api/auth/me'));
    } catch (err) {
      if (!(err instanceof HttpErrorResponse && err.status === 401)) return undefined;
      this.blockedUrl.set(null);
      this.state.set(null);
      return null;
    }
    const synced = await this.syncTimezone(user);
    this.blockedUrl.set(null);
    this.state.set(synced);
    return synced;
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
