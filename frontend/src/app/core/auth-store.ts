import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Observable, Subject, type MonoTypeOperatorFunction } from 'rxjs';
import type { User } from './models';
import { ToastService } from './toast-service';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly state = signal<User | null | undefined>(undefined);
  private readonly blockedUrl = signal<string | null>(null);
  private readonly sessionEnded = new Subject<void>();
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
    this.setUser(null);
  }

  /** Unsubscribes without completing when the signed-in user changes, so no handler runs for the old session. */
  endWithSession<T>(): MonoTypeOperatorFunction<T> {
    return (source) =>
      new Observable<T>((subscriber) => {
        const ended = this.sessionEnded.subscribe(() => subscriber.unsubscribe());
        subscriber.add(ended);
        subscriber.add(source.subscribe(subscriber));
      });
  }

  logout(): void {
    const done = () => {
      this.setUser(null);
      void this.router.navigate(['/login']);
    };
    this.http.post('/api/auth/logout', {}).subscribe({
      complete: done,
      error: (err: unknown) => {
        // 401 means the session is already gone; any other failure may leave it valid on the server.
        if (err instanceof HttpErrorResponse && err.status === 401) done();
        else this.toasts.error("Couldn't sign out. Try again.");
      },
    });
  }

  private async load(): Promise<User | null | undefined> {
    let user: User;
    try {
      user = await firstValueFrom(this.http.get<User>('/api/auth/me'));
    } catch (err) {
      if (!(err instanceof HttpErrorResponse && err.status === 401)) return undefined;
      this.blockedUrl.set(null);
      this.setUser(null);
      return null;
    }
    const synced = await this.syncTimezone(user);
    this.blockedUrl.set(null);
    this.setUser(synced);
    return synced;
  }

  private setUser(user: User | null): void {
    const previous = this.state();
    this.state.set(user);
    if (previous && previous.id !== user?.id) this.sessionEnded.next();
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
