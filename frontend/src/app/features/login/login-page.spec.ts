import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(error?: string) {
    fixture = TestBed.createComponent(LoginPage);
    if (error !== undefined) fixture.componentRef.setInput('error', error);
    await fixture.whenStable();
  }

  it('offers both providers and shows no alert without an error code', async () => {
    await render();
    const links = [...el().querySelectorAll<HTMLAnchorElement>('a.provider')].map((a) => [
      a.textContent!.trim(),
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Continue with Google', '/api/auth/google/start'],
      ['Continue with GitHub', '/api/auth/github/start'],
    ]);
    expect(el().querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    ['access_denied', 'Sign-in was cancelled. Choose a provider to try again.'],
    ['sso_failed', 'Sign-in failed. Please try again.'],
  ])('maps the allow-listed code %s to its message', async (code, message) => {
    await render(code);
    expect(el().querySelector('[role="alert"]')!.textContent).toBe(message);
  });

  it.each(['something_new', '<img src=x onerror=alert(1)>', 'constructor'])(
    'shows the generic message for an unknown code and never echoes it (%s)',
    async (code) => {
      await render(code);
      const alert = el().querySelector('[role="alert"]')!;
      expect(alert.textContent).toBe('Sign-in failed. Please try again.');
      expect(el().innerHTML).not.toContain(code);
    },
  );
});
