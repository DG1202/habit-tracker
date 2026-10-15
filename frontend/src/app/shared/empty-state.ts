import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ht-empty-state',
  template: `
    <div class="empty-state card">
      <div class="empty-icon" aria-hidden="true">{{ icon() }}</div>
      <h2>{{ title() }}</h2>
      <p class="muted">{{ message() }}</p>
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly icon = input('✨');
  readonly title = input.required<string>();
  readonly message = input('');
}
