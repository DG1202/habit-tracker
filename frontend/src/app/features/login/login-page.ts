import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const LOGIN_ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled. Choose a provider to try again.',
  sso_failed: 'Sign-in failed. Please try again.',
};

@Component({
  selector: 'ht-login-page',
  templateUrl: './login-page.html',
  styles: `
    :host { display: grid; place-items: center; min-height: calc(100vh - 96px); }
    .login { width: min(420px, 100%); padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-5); text-align: center; }
    .brand { font-size: 2.5rem; }
    .providers { display: flex; flex-direction: column; gap: var(--space-3); }
    .provider { min-height: 48px; font-size: var(--text-md); }
    .provider svg { width: 20px; height: 20px; }
    .footnote { font-size: var(--text-xs); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly error = input<string>();
  protected readonly errorMessage = computed(() => {
    const code = this.error();
    if (!code) return null;
    return Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code] : LOGIN_ERRORS['sso_failed'];
  });
}
