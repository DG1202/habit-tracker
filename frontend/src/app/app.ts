import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth-store';
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
}
