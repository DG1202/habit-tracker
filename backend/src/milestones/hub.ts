import type { WebSocket } from 'ws';
import type { SessionRef } from '../auth/sessions.ts';
import type { Clock } from '../lib/clock.ts';

export const SESSION_ENDED_CLOSE_CODE = 4401;

interface Connection {
  session: SessionRef;
  subscribed: boolean;
}

export function createHub(clock: Clock) {
  const users = new Map<string, Map<WebSocket, Connection>>();

  const end = (userId: string, socket: WebSocket) => {
    remove(userId, socket);
    socket.close(SESSION_ENDED_CLOSE_CODE, 'Session ended');
  };

  function remove(userId: string, socket: WebSocket): void {
    const connections = users.get(userId);
    connections?.delete(socket);
    if (connections?.size === 0) users.delete(userId);
  }

  // Closes expired sockets as a side effect, so callers only ever see live subscribers.
  function subscribers(userId: string): WebSocket[] {
    const live: WebSocket[] = [];
    for (const [socket, connection] of users.get(userId) ?? []) {
      if (connection.session.expiresAt <= clock.now()) end(userId, socket);
      else if (connection.subscribed) live.push(socket);
    }
    return live;
  }

  return {
    add(userId: string, socket: WebSocket, session: SessionRef): void {
      const connections = users.get(userId) ?? new Map<WebSocket, Connection>();
      connections.set(socket, { session, subscribed: false });
      users.set(userId, connections);
    },
    subscribe(userId: string, socket: WebSocket): void {
      const connection = users.get(userId)?.get(socket);
      if (connection) connection.subscribed = true;
    },
    remove,
    // False, and the socket is closed, once its session has ended or expired.
    isLive(userId: string, socket: WebSocket): boolean {
      const connection = users.get(userId)?.get(socket);
      if (!connection) return false;
      if (connection.session.expiresAt > clock.now()) return true;
      end(userId, socket);
      return false;
    },
    closeSession(sessionId: string): void {
      for (const [userId, connections] of users) {
        for (const [socket, connection] of connections) {
          if (connection.session.id === sessionId) end(userId, socket);
        }
      }
    },
    has(userId: string): boolean {
      return subscribers(userId).length > 0;
    },
    send(userId: string, message: object): void {
      const data = JSON.stringify(message);
      for (const socket of subscribers(userId)) {
        if (socket.readyState === socket.OPEN) socket.send(data);
      }
    },
  };
}

export type Hub = ReturnType<typeof createHub>;
