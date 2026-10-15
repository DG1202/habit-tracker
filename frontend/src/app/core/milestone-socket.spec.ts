import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthStore } from './auth-store';
import { MilestoneSocket, WEB_SOCKET_FACTORY } from './milestone-socket';
import { ToastService } from './toast-service';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('MilestoneSocket', () => {
  let socket: MilestoneSocket;
  let toasts: ToastService;
  let auth: { clear: ReturnType<typeof vi.fn> };
  const latest = () => FakeSocket.instances.at(-1)!;

  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    auth = { clear: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: WEB_SOCKET_FACTORY, useValue: (url: string) => new FakeSocket(url) as unknown as WebSocket },
        { provide: AuthStore, useValue: auth },
      ],
    });
    socket = TestBed.inject(MilestoneSocket);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    socket.disconnect();
    vi.useRealTimers();
  });

  it('subscribes on open and reports connected once the server confirms', () => {
    socket.connect();
    expect(latest().url).toMatch(/^ws:\/\/.+\/ws$/);
    expect(socket.status()).toBe('connecting');

    latest().open();
    expect(latest().sent).toEqual([{ type: 'subscribe', topics: ['milestones'] }]);
    latest().receive({ type: 'subscribed', topics: ['milestones'] });
    expect(socket.status()).toBe('connected');
  });

  it('shows a toast per milestone and acks it when dismissed', () => {
    socket.connect();
    latest().open();
    latest().receive({ type: 'milestone', id: 'n1', habitId: 'h1', habitName: 'Read', milestone: 7, currentStreak: 7, sentAt: '' });

    const [toast] = toasts.toasts();
    expect(toast).toMatchObject({ kind: 'milestone', title: '7-day streak!' });
    expect(toast!.message).toContain('Read');

    toasts.dismiss(toast!.id);
    expect(latest().sent).toContainEqual({ type: 'ack', id: 'n1' });
  });

  it('reconnects with backoff after the connection drops', () => {
    socket.connect();
    latest().open();
    latest().close();
    expect(socket.status()).toBe('disconnected');
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    latest().close();
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('clears the session and does not reconnect when the server ends the session (4401)', () => {
    socket.connect();
    latest().open();
    latest().close(4401);
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect(socket.status()).toBe('disconnected');

    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('does not clear the session on an ordinary drop', () => {
    socket.connect();
    latest().open();
    latest().close();
    expect(auth.clear).not.toHaveBeenCalled();
  });

  it('stops reconnecting after disconnect', () => {
    socket.connect();
    latest().open();
    socket.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('ignores malformed frames', () => {
    socket.connect();
    latest().open();
    latest().onmessage?.({ data: 'not json' });
    expect(toasts.toasts()).toEqual([]);
  });

  const milestoneFrame = { type: 'milestone', id: 'n1', habitId: 'h1', habitName: 'Read', milestone: 7, currentStreak: 7, sentAt: '' };

  it('clears milestone toasts on disconnect without acking them', () => {
    socket.connect();
    latest().open();
    latest().receive(milestoneFrame);
    const first = latest();
    socket.disconnect();
    expect(toasts.toasts().filter((t) => t.kind === 'milestone')).toEqual([]);
    expect(first.sent).not.toContainEqual({ type: 'ack', id: 'n1' });
  });

  it('keeps non-milestone toasts when clearing milestones', () => {
    toasts.error('boom');
    socket.connect();
    socket.disconnect();
    expect(toasts.toasts()).toHaveLength(1);
  });

  it('queues an ack dismissed while offline and flushes it after subscribed', () => {
    socket.connect();
    latest().open();
    latest().receive(milestoneFrame);
    latest().close();
    toasts.dismiss(toasts.toasts()[0]!.id);

    vi.advanceTimersByTime(1000);
    latest().open();
    expect(latest().sent).toEqual([{ type: 'subscribe', topics: ['milestones'] }]);
    latest().receive({ type: 'subscribed', topics: ['milestones'] });
    expect(latest().sent).toContainEqual({ type: 'ack', id: 'n1' });
  });

  it('drops queued acks on disconnect', () => {
    socket.connect();
    latest().open();
    latest().receive(milestoneFrame);
    latest().close();
    toasts.dismiss(toasts.toasts()[0]!.id);
    socket.disconnect();

    socket.connect();
    latest().open();
    latest().receive({ type: 'subscribed', topics: ['milestones'] });
    expect(latest().sent).toEqual([{ type: 'subscribe', topics: ['milestones'] }]);
  });

  it('ignores frames from a socket that was disconnected', () => {
    socket.connect();
    latest().open();
    const old = latest();
    socket.disconnect();
    old.receive(milestoneFrame);
    expect(toasts.toasts()).toEqual([]);
  });
});
