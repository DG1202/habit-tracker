import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../core/auth-store';
import { MilestoneSocket } from '../core/milestone-socket';

@Component({
  selector: 'ht-top-bar',
  imports: [RouterLink],
  template: `
    <header class="top-bar">
      <a routerLink="/" class="brand">🔥 <span>Habit Tracker</span></a>
      <div class="account">
        <span
          class="connection"
          [attr.data-status]="socket.status()"
          [attr.title]="connectionLabel()"
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="visually-hidden">{{ connectionLabel() }}</span>
        </span>
        @if (avatarUrl(); as src) {
          <img class="avatar" [src]="src" alt="" referrerpolicy="no-referrer" />
        }
        <span class="name">{{ auth.user()?.displayName }}</span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="auth.logout()">Log out</button>
      </div>
    </header>
  `,
  styles: `
    .top-bar {
      position: sticky;
      top: 0;
      min-height: var(--top-bar-h);
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-5);
      background: var(--color-top-bar);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--color-border);
    }
    .brand {
      font-weight: 700;
      color: var(--color-text);
      text-decoration: none;
    }
    .account {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .connection {
      display: inline-flex;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-border-strong);
    }
    .connection[data-status='connected'] .dot {
      background: var(--color-success);
    }
    .connection[data-status='connecting'] .dot {
      background: var(--color-warning);
    }
    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
    @media (max-width: 600px) {
      .name,
      .brand span {
        display: none;
      }
      .top-bar {
        padding: var(--space-3) var(--space-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBar {
  protected readonly auth = inject(AuthStore);
  protected readonly socket = inject(MilestoneSocket);
  protected readonly connectionLabel = computed(
    () =>
      ({
        connected: 'Live notifications on',
        connecting: 'Connecting…',
        disconnected: 'Live notifications offline',
      })[this.socket.status()],
  );
  protected readonly avatarUrl = computed(() => {
    const url = this.auth.user()?.avatarUrl;
    return url?.startsWith('https://') ? url : null;
  });
}
