import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
}
