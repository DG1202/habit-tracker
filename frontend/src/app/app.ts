import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, skip } from 'rxjs/operators';
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
    <main #main class="page" tabindex="-1">
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
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    // The activated link is usually destroyed, so move focus to the new view; the first load keeps the default.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.main().nativeElement.focus());
    effect(() => {
      const user = this.auth.user();
      if (user) this.socket.connect(user.id);
      else this.socket.disconnect();
    });
  }
}
