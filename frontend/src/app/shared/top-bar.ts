import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../core/auth-store';

@Component({
  selector: 'ht-top-bar',
  imports: [RouterLink],
  template: `
    <header class="top-bar">
      <a routerLink="/" class="brand">🔥 <span>Habit Tracker</span></a>
      <div class="account">
        @if (avatarUrl(); as src) {
          <img class="avatar" [src]="src" alt="" referrerpolicy="no-referrer" />
        }
        <span class="name">{{ auth.user()?.displayName }}</span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="auth.logout()">Log out</button>
      </div>
    </header>
  `,
  styles: `
    .top-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-5); background: rgb(255 255 255 / 90%); backdrop-filter: blur(8px); border-bottom: 1px solid var(--color-border); }
    .brand { font-weight: 700; color: var(--color-text); text-decoration: none; }
    .account { display: flex; align-items: center; gap: var(--space-3); }
    .avatar { width: 32px; height: 32px; border-radius: 50%; }
    @media (max-width: 600px) { .name, .brand span { display: none; } .top-bar { padding: var(--space-3) var(--space-4); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBar {
  protected readonly auth = inject(AuthStore);
  protected readonly avatarUrl = computed(() => {
    const url = this.auth.user()?.avatarUrl;
    return url?.startsWith('https://') ? url : null;
  });
}
