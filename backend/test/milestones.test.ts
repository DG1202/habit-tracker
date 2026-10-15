import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createHabitWithStreak,
  createTestContext,
  milestonesOf,
  openSocket,
  request,
  signIn,
  sleep,
  subscribe,
  userIdOf,
  waitFor,
  type TestContext,
} from './helpers.ts';

describe('WebSocket milestone notifications', () => {
  let ctx: TestContext;
  let alice: string;
  let aliceId: string;
  const sockets: { ws: { terminate(): void } }[] = [];

  beforeEach(async () => {
    ctx = await createTestContext('2026-10-15T12:00:00.000Z');
    alice = await signIn(ctx, 'google');
    aliceId = await userIdOf(ctx, alice);
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.ws.terminate();
    await ctx.close();
  });

  const connect = async (cookie: string) => {
    const socket = await openSocket(ctx, cookie);
    sockets.push(socket);
    return socket;
  };

  it('sends nothing before the client subscribes', async () => {
    await createHabitWithStreak(ctx, aliceId, { days: 3, endingOn: '2026-10-15' });
    const socket = await connect(alice);
    await sleep(150);
    expect(socket.messages).toEqual([]);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(0);
  });

  it('sends no milestone when the streak is below 3', async () => {
    await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-10-15' });
    const socket = await connect(alice);
    await subscribe(socket);
    expect(socket.messages).toEqual([{ type: 'subscribed', topics: ['milestones'] }]);
  });

  it.each([
    [3, [3]],
    [7, [3, 7]],
    [30, [3, 7, 30]],
  ])('sends milestones for a %i-day streak on subscribe', async (days, expected) => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days, endingOn: '2026-10-14', name: 'Read' });
    const socket = await connect(alice);
    await subscribe(socket);

    expect(milestonesOf(socket.messages)).toEqual(expected);
    expect(socket.messages.find((m) => m.type === 'milestone')).toMatchObject({
      habitId: habit.id,
      habitName: 'Read',
      currentStreak: days,
      id: expect.any(String),
      sentAt: '2026-10-15T12:00:00.000Z',
    });
  });

  it('does not resend milestones after reconnecting', async () => {
    await createHabitWithStreak(ctx, aliceId, { days: 7, endingOn: '2026-10-15' });
    const first = await connect(alice);
    await subscribe(first);
    expect(milestonesOf(first.messages)).toEqual([3, 7]);
    first.ws.terminate();

    const second = await connect(alice);
    await subscribe(second);
    expect(milestonesOf(second.messages)).toEqual([]);
  });

  it('pushes a milestone live when a check-in completes it', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-10-14' });
    const socket = await connect(alice);
    await subscribe(socket);
    expect(milestonesOf(socket.messages)).toEqual([]);

    await request(ctx, alice, { method: 'POST', url: `/api/habits/${habit.id}/check-ins`, payload: {} });
    await waitFor(() => milestonesOf(socket.messages).length === 1);
    expect(milestonesOf(socket.messages)).toEqual([3]);
  });

  it('does not consume a milestone when the check-in happens with no socket open', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-10-14' });
    await request(ctx, alice, { method: 'POST', url: `/api/habits/${habit.id}/check-ins`, payload: {} });
    expect(await ctx.prisma.milestoneNotification.count()).toBe(0);

    const socket = await connect(alice);
    await subscribe(socket);
    expect(milestonesOf(socket.messages)).toEqual([3]);
  });

  it('delivers to every open tab once and stores one record', async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-10-14' });
    const tabA = await connect(alice);
    const tabB = await connect(alice);
    await subscribe(tabA);
    await subscribe(tabB);

    await request(ctx, alice, { method: 'POST', url: `/api/habits/${habit.id}/check-ins`, payload: {} });
    await waitFor(() => milestonesOf(tabA.messages).length === 1 && milestonesOf(tabB.messages).length === 1);
    expect(await ctx.prisma.milestoneNotification.count()).toBe(1);

    const tabC = await connect(alice);
    await subscribe(tabC);
    expect(milestonesOf(tabC.messages)).toEqual([]);
  });

  it("never delivers another user's milestones", async () => {
    const bob = await signIn(ctx, 'github');
    const bobSocket = await connect(bob);
    await subscribe(bobSocket);

    const habit = await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-10-14' });
    const aliceSocket = await connect(alice);
    await subscribe(aliceSocket);
    await request(ctx, alice, { method: 'POST', url: `/api/habits/${habit.id}/check-ins`, payload: {} });
    await waitFor(() => milestonesOf(aliceSocket.messages).length === 1);
    await sleep(50);
    expect(milestonesOf(bobSocket.messages)).toEqual([]);
  });

  it('acknowledges a notification as read, only for its owner', async () => {
    await createHabitWithStreak(ctx, aliceId, { days: 3, endingOn: '2026-10-15' });
    const socket = await connect(alice);
    await subscribe(socket);
    const id = socket.messages.find((m) => m.type === 'milestone')!.id as string;

    const bob = await signIn(ctx, 'github');
    const bobSocket = await connect(bob);
    bobSocket.ws.send(JSON.stringify({ type: 'ack', id }));
    await waitFor(() => bobSocket.messages.length === 1);
    expect(bobSocket.messages[0]).toMatchObject({ type: 'error', code: 'NOT_FOUND' });
    expect((await ctx.prisma.milestoneNotification.findUniqueOrThrow({ where: { id } })).ackedAt).toBeNull();

    socket.ws.send(JSON.stringify({ type: 'ack', id }));
    await waitFor(() => socket.messages.some((m) => m.type === 'acked'));
    expect((await ctx.prisma.milestoneNotification.findUniqueOrThrow({ where: { id } })).ackedAt).not.toBeNull();
  });

  it("closes a session's sockets on logout and delivers nothing further to them", async () => {
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-10-14' });
    const otherSession = await signIn(ctx, 'google');
    const loggedOut = await connect(alice);
    const loggedOutIdle = await connect(alice);
    const stillIn = await connect(otherSession);
    await subscribe(loggedOut);
    await subscribe(stillIn);

    const res = await request(ctx, alice, { method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    await waitFor(() => loggedOut.closeCode !== null && loggedOutIdle.closeCode !== null);
    expect(loggedOut.closeCode).toBe(4401);
    expect(loggedOutIdle.closeCode).toBe(4401);
    expect(stillIn.closeCode).toBeNull();

    await request(ctx, otherSession, { method: 'POST', url: `/api/habits/${habit.id}/check-ins`, payload: {} });
    await waitFor(() => milestonesOf(stillIn.messages).length === 1);
    expect(milestonesOf(loggedOut.messages)).toEqual([]);
  });

  it('skips and closes the socket of an expired session while a live session still gets the milestone', async () => {
    const expired = await connect(alice);
    await subscribe(expired);

    ctx.clock.set('2026-11-20T12:00:00.000Z');
    const fresh = await signIn(ctx, 'google');
    const habit = await createHabitWithStreak(ctx, aliceId, { days: 2, endingOn: '2026-11-19' });
    const live = await connect(fresh);
    await subscribe(live);
    await request(ctx, fresh, { method: 'POST', url: `/api/habits/${habit.id}/check-ins`, payload: {} });

    await waitFor(() => milestonesOf(live.messages).length === 1);
    await waitFor(() => expired.closeCode !== null);
    expect(expired.closeCode).toBe(4401);
    expect(milestonesOf(expired.messages)).toEqual([]);
  });

  it('rejects an ack from a socket whose session has expired', async () => {
    await createHabitWithStreak(ctx, aliceId, { days: 3, endingOn: '2026-10-15' });
    const socket = await connect(alice);
    await subscribe(socket);
    const id = socket.messages.find((m) => m.type === 'milestone')!.id as string;

    ctx.clock.set('2026-11-20T12:00:00.000Z');
    socket.ws.send(JSON.stringify({ type: 'ack', id }));
    await waitFor(() => socket.closeCode !== null);
    expect(socket.closeCode).toBe(4401);
    expect(socket.messages.some((m) => m.type === 'acked')).toBe(false);
    expect((await ctx.prisma.milestoneNotification.findUniqueOrThrow({ where: { id } })).ackedAt).toBeNull();
  });

  it('answers malformed messages with an error and keeps the socket open', async () => {
    const socket = await connect(alice);
    socket.ws.send('not json');
    socket.ws.send(JSON.stringify({ type: 'subscribe', topics: ['everything'] }));
    await waitFor(() => socket.messages.length === 2);
    expect(socket.messages.every((m) => m.type === 'error' && m.code === 'INVALID_MESSAGE')).toBe(true);
    await subscribe(socket);
  });

  it('rejects connections without a session or from another origin', async () => {
    await expect(openSocket(ctx, null)).rejects.toThrow('Unexpected server response: 401');
    await expect(openSocket(ctx, alice, 'https://evil.example.test')).rejects.toThrow('Unexpected server response: 403');
  });
});
