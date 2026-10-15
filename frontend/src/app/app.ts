import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth-store';
import { MilestoneSocket } from './core/milestone-socket';
import { ToastStack } from './shared/toast-stack';
import { TopBar } from './shared/top-bar';

@Component({
  selector: 'ht-root',
  imports: [RouterOutlet, TopBar, ToastStack],
  template: `
    @if (auth.user()) {
      <ht-top-bar />
    }
    <main class="page"><router-outlet /></main>
    <ht-toast-stack />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthStore);
  private readonly socket = inject(MilestoneSocket);

  constructor() {
    effect(() => (this.auth.user() ? this.socket.connect() : this.socket.disconnect()));
  }
}
