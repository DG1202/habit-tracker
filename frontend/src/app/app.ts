import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth-store';
import { MilestoneSocket } from './core/milestone-socket';
import { ErrorBanner } from './shared/error-banner';
import { ToastStack } from './shared/toast-stack';
import { TopBar } from './shared/top-bar';

@Component({
  selector: 'ht-root',
  imports: [RouterOutlet, TopBar, ToastStack, ErrorBanner],
  template: `
    @if (auth.user()) {
      <ht-top-bar />
    }
    <main class="page" tabindex="-1">
      @if (auth.unreachable()) {
        <ht-error-banner message="Cannot reach the server. Check your connection and try again." (retry)="auth.retry()" />
      }
      <router-outlet />
    </main>
    <ht-toast-stack />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthStore);
  private readonly socket = inject(MilestoneSocket);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) this.socket.connect(user.id);
      else this.socket.disconnect();
    });
  }
}
