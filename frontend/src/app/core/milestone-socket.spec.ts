import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthStore } from './auth-store';
import { MilestoneSocket, socketUrl, WEB_SOCKET_FACTORY } from './milestone-socket';
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
  let router: { navigate: ReturnType<typeof vi.fn> };
  const latest = () => FakeSocket.instances.at(-1)!;
  const acks = (fake: FakeSocket) => fake.sent.filter((frame) => (frame as { type: string }).type === 'ack');

  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    auth = { clear: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: WEB_SOCKET_FACTORY, useValue: (url: string) => new FakeSocket(url) as unknown as WebSocket },
        { provide: AuthStore, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    socket = TestBed.inject(MilestoneSocket);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    socket.disconnect();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('subscribes on open and reports connected once the server confirms', () => {
    socket.connect('u1');
    expect(latest().url).toMatch(/^ws:\/\/.+\/ws$/);
    expect(socket.status()).toBe('connecting');

    latest().open();
    expect(latest().sent).toEqual([{ type: 'subscribe', topics: ['milestones'] }]);
    latest().receive({ type: 'subscribed', topics: ['milestones'] });
    expect(socket.status()).toBe('connected');
  });

  it('shows a toast per milestone and acks it when dismissed', () => {
    socket.connect('u1');
    latest().open();
    latest().receive({ type: 'milestone', id: 'n1', habitId: 'h1', habitName: 'Read', milestone: 7, currentStreak: 7, sentAt: '' });

    const [toast] = toasts.toasts();
    expect(toast).toMatchObject({ kind: 'milestone', title: '7-day streak!' });
    expect(toast!.message).toContain('Read');

    toasts.dismiss(toast!.id);
    expect(latest().sent).toContainEqual({ type: 'ack', id: 'n1' });
  });

  it('reconnects with jittered exponential backoff after the connection drops', () => {
    socket.connect('u1');
    latest().open();
    latest().close();
    expect(socket.status()).toBe('disconnected');
    expect(FakeSocket.instances).toHaveLength(1);

    // Math.random() = 0.5 → 75% of the 1 s, 2 s, ... steps.
    vi.advanceTimersByTime(749);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    latest().close();
    vi.advanceTimersByTime(1499);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('spreads reconnect delays between half and all of the capped step', () => {
    vi.mocked(Math.random).mockReturnValue(0);
    socket.connect('u1');
    latest().close();
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(2);

    vi.mocked(Math.random).mockReturnValue(0.999);
    for (let i = 0; i < 10; i++) {
      latest().close();
      vi.advanceTimersByTime(30_000);
    }
    const before = FakeSocket.instances.length;
    latest().close();
    vi.advanceTimersByTime(29_000);
    expect(FakeSocket.instances).toHaveLength(before);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.instances).toHaveLength(before + 1);
  });

  it('resets the backoff once the server confirms the subscription', () => {
    socket.connect('u1');
    latest().close();
    vi.advanceTimersByTime(750);
    latest().close();
    vi.advanceTimersByTime(1500);
    latest().open();
    latest().receive({ type: 'subscribed', topics: ['milestones'] });
    latest().close();

    const before = FakeSocket.instances.length;
    vi.advanceTimersByTime(750);
    expect(FakeSocket.instances).toHaveLength(before + 1);
  });

  it('clears the session, goes to /login and does not reconnect when the server ends the session (4401)', () => {
    socket.connect('u1');
    latest().open();
    latest().close(4401);
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(socket.status()).toBe('disconnected');

    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('drops milestone toasts and queued acks itself when the server ends the session (4401)', () => {
    const frame = { type: 'milestone', habitId: 'h1', habitName: 'Read', milestone: 7, currentStreak: 7, sentAt: '' };
    socket.connect('u1');
    latest().open();
    latest().receive({ type: 'subscribed' });
    latest().receive({ ...frame, id: 'n1' });
    latest().receive({ ...frame, id: 'n2' });
    latest().receive({ ...frame, id: 'n3' });
    toasts.dismiss(toasts.toasts()[0]!.id);
    toasts.dismiss(toasts.toasts()[0]!.id);
    expect(acks(latest())).toHaveLength(1);

    latest().close(4401);
    expect(toasts.toasts().filter((t) => t.kind === 'milestone')).toEqual([]);

    socket.connect('u1');
    expect(FakeSocket.instances).toHaveLength(2);
    latest().open();
    latest().receive({ type: 'subscribed' });
    vi.advanceTimersByTime(1000);
    expect(acks(latest())).toEqual([]);
  });

  it('does not clear the session on an ordinary drop', () => {
    socket.connect('u1');
    latest().open();
    latest().close();
    expect(auth.clear).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('stops reconnecting after disconnect', () => {
    socket.connect('u1');
    latest().open();
    socket.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('ignores malformed frames', () => {
    socket.connect('u1');
    latest().open();
    latest().onmessage?.({ data: 'not json' });
    expect(toasts.toasts()).toEqual([]);
  });

  const milestoneFrame = { type: 'milestone', id: 'n1', habitId: 'h1', habitName: 'Read', milestone: 7, currentStreak: 7, sentAt: '' };

  it('clears milestone toasts on disconnect without acking them', () => {
    socket.connect('u1');
    latest().open();
    latest().receive(milestoneFrame);
    const first = latest();
    socket.disconnect();
    expect(toasts.toasts().filter((t) => t.kind === 'milestone')).toEqual([]);
    expect(first.sent).not.toContainEqual({ type: 'ack', id: 'n1' });
  });

  it('clears every toast, not only milestones, when the user signs out', () => {
    socket.connect('u1');
    latest().open();
    latest().receive(milestoneFrame);
    toasts.success('"Synthetic habit" was deleted');
    toasts.error('boom');
    socket.disconnect();
    expect(toasts.toasts()).toEqual([]);
  });

  it('clears every toast when a different user connects', () => {
    socket.connect('u1');
    toasts.success('"Synthetic habit" was deleted');
    socket.connect('u2');
    expect(toasts.toasts()).toEqual([]);
  });

  it('queues an ack dismissed while offline and flushes it after subscribed', () => {
    socket.connect('u1');
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
    socket.connect('u1');
    latest().open();
    latest().receive(milestoneFrame);
    latest().close();
    toasts.dismiss(toasts.toasts()[0]!.id);
    socket.disconnect();

    socket.connect('u1');
    latest().open();
    latest().receive({ type: 'subscribed', topics: ['milestones'] });
    expect(latest().sent).toEqual([{ type: 'subscribe', topics: ['milestones'] }]);
  });

  it('ignores frames from a socket that was disconnected', () => {
    socket.connect('u1');
    latest().open();
    const old = latest();
    socket.disconnect();
    old.receive(milestoneFrame);
    expect(toasts.toasts()).toEqual([]);
  });

  it('ignores milestone frames with the wrong shape', () => {
    socket.connect('u1');
    latest().open();
    latest().receive({ type: 'milestone', id: 'n1', habitName: 'Read', milestone: '7', currentStreak: 7 });
    latest().receive({ type: 'milestone', id: 42, habitId: 'h1', habitName: 'Read', milestone: 7, currentStreak: 7, sentAt: '' });
    latest().receive({ type: 'milestone', id: 'n2', habitId: 'h1', milestone: 7, currentStreak: 7, sentAt: '' });
    latest().onmessage?.({ data: 'null' });
    expect(toasts.toasts()).toEqual([]);
  });

  it('does not subscribe from a socket that opens after it was replaced', () => {
    socket.connect('u1');
    const old = latest();
    socket.disconnect();
    old.open();
    expect(old.sent).toEqual([]);
  });

  it('builds a wss URL on https and a ws URL on http', () => {
    expect(socketUrl({ protocol: 'https:', host: 'habits.example.test' })).toBe('wss://habits.example.test/ws');
    expect(socketUrl({ protocol: 'http:', host: 'localhost:4300' })).toBe('ws://localhost:4300/ws');
  });

  describe('ack pacing', () => {
    function receiveMilestones(count: number) {
      for (let i = 1; i <= count; i++) latest().receive({ ...milestoneFrame, id: `n${i}`, habitId: `h${i}` });
    }

    it('sends at most 4 acks per second when many toasts are dismissed at once', () => {
      socket.connect('u1');
      latest().open();
      latest().receive({ type: 'subscribed', topics: ['milestones'] });
      receiveMilestones(10);
      toasts.toasts().forEach((toast) => toasts.dismiss(toast.id));

      expect(acks(latest())).toHaveLength(1);
      vi.advanceTimersByTime(999);
      expect(acks(latest())).toHaveLength(4);
      vi.advanceTimersByTime(1);
      expect(acks(latest())).toHaveLength(5);
      vi.advanceTimersByTime(10_000);
      expect(acks(latest()).map((frame) => (frame as { id: string }).id)).toEqual(Array.from({ length: 10 }, (_, i) => `n${i + 1}`));
    });

    it('paces a queued flush after reconnecting', () => {
      socket.connect('u1');
      latest().open();
      receiveMilestones(8);
      latest().close();
      toasts.toasts().forEach((toast) => toasts.dismiss(toast.id));

      vi.advanceTimersByTime(750);
      latest().open();
      latest().receive({ type: 'subscribed', topics: ['milestones'] });
      expect(acks(latest())).toHaveLength(1);
      vi.advanceTimersByTime(999);
      expect(acks(latest())).toHaveLength(4);
      vi.advanceTimersByTime(5_000);
      expect(acks(latest())).toHaveLength(8);
    });

    it('keeps unsent acks queued when the socket drops mid-flush', () => {
      socket.connect('u1');
      latest().open();
      latest().receive({ type: 'subscribed', topics: ['milestones'] });
      receiveMilestones(3);
      toasts.toasts().forEach((toast) => toasts.dismiss(toast.id));
      const first = latest();
      first.close();
      vi.advanceTimersByTime(750);
      expect(acks(first)).toHaveLength(1);

      latest().open();
      latest().receive({ type: 'subscribed', topics: ['milestones'] });
      vi.advanceTimersByTime(1_000);
      expect(acks(latest()).map((frame) => (frame as { id: string }).id)).toEqual(['n2', 'n3']);
    });
  });

  describe('user switch', () => {
    it('ignores a repeated connect for the same user', () => {
      socket.connect('u1');
      socket.connect('u1');
      expect(FakeSocket.instances).toHaveLength(1);
    });

    it('drops the previous user\'s toasts and queued acks when another user connects', () => {
      socket.connect('u1');
      latest().open();
      latest().receive(milestoneFrame);
      latest().receive({ ...milestoneFrame, id: 'n2', habitId: 'h2' });
      latest().close();
      toasts.dismiss(toasts.toasts()[0]!.id);
      // u1's reconnect timer has not fired, so its ack is still queued.
      socket.connect('u2');
      expect(FakeSocket.instances).toHaveLength(2);
      expect(toasts.toasts()).toEqual([]);

      latest().open();
      latest().receive({ type: 'subscribed', topics: ['milestones'] });
      vi.advanceTimersByTime(5_000);
      expect(acks(latest())).toEqual([]);
    });
  });
});
