import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MilestoneSocket, WEB_SOCKET_FACTORY } from './milestone-socket';
import { ToastService } from './toast-service';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
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
  const latest = () => FakeSocket.instances.at(-1)!;

  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [{ provide: WEB_SOCKET_FACTORY, useValue: (url: string) => new FakeSocket(url) as unknown as WebSocket }],
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
});
