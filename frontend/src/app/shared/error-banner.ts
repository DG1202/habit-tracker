import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { restoreFocusOnDestroy } from './restore-focus';

@Component({
  selector: 'ht-error-banner',
  template: `
    <div class="alert" role="alert">
      <span>{{ message() }}</span>
      <button type="button" class="btn btn-sm" (click)="retry.emit()">Retry</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorBanner {
  readonly message = input.required<string>();
  readonly retry = output<void>();

  constructor() {
    // Retry removes the banner, so focus goes to <main> instead of <body>.
    restoreFocusOnDestroy(null);
  }
}
