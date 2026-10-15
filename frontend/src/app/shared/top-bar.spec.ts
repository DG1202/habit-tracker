import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthStore } from '../core/auth-store';
import { MilestoneSocket, type SocketStatus } from '../core/milestone-socket';
import type { User } from '../core/models';
import { TopBar } from './top-bar';

const USER: User = {
  id: 'u1',
  provider: 'github',
  email: null,
  displayName: 'Alice Test',
  avatarUrl: null,
  timezone: 'UTC',
};

describe('TopBar', () => {
  const user = signal<User | null>(USER);
  const status = signal<SocketStatus>('disconnected');
  const logout = vi.fn();
  let fixture: ComponentFixture<TopBar>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    user.set(USER);
    status.set('disconnected');
    logout.mockClear();
    TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { user, logout } },
        { provide: MilestoneSocket, useValue: { status } },
      ],
    });
    fixture = TestBed.createComponent(TopBar);
    await fixture.whenStable();
  });

  it('shows the display name and logs out from the button', () => {
    expect(el().querySelector('.name')!.textContent).toBe('Alice Test');
    el().querySelector<HTMLButtonElement>('button')!.click();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('puts the full display name in a title, since a long one is ellipsized', async () => {
    user.set({ ...USER, displayName: 'Alexandra Montgomery-Fitzgerald Test' });
    await fixture.whenStable();
    expect(el().querySelector('.name')!.getAttribute('title')).toBe(
      'Alexandra Montgomery-Fitzgerald Test',
    );
  });

  it('renders an https avatar as decorative without sending a referrer', async () => {
    user.set({ ...USER, avatarUrl: 'https://avatars.example.test/u/1.png' });
    await fixture.whenStable();
    const img = el().querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://avatars.example.test/u/1.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it.each([
    ['http', 'http://avatars.example.test/u/1.png'],
    ['protocol-relative', '//avatars.example.test/u/1.png'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:image/svg+xml,<svg/>'],
    ['uppercase scheme trick', 'HTTPS://avatars.example.test/u/1.png'],
    ['missing', null],
  ])('drops a non-https avatar URL (%s)', async (_label, avatarUrl) => {
    user.set({ ...USER, avatarUrl });
    await fixture.whenStable();
    expect(el().querySelector('img')).toBeNull();
  });

  it.each([
    ['connected', 'Live notifications on'],
    ['connecting', 'Connecting…'],
    ['disconnected', 'Live notifications offline'],
  ] as const)(
    'labels the %s connection state for screen readers and on hover',
    async (state, label) => {
      status.set(state);
      await fixture.whenStable();
      const connection = el().querySelector('.connection')!;
      expect(connection.getAttribute('data-status')).toBe(state);
      expect(connection.getAttribute('title')).toBe(label);
      expect(connection.querySelector('.visually-hidden')!.textContent).toBe(label);
    },
  );
});
