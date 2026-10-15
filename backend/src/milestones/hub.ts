import type { WebSocket } from 'ws';

export function createHub() {
  const sockets = new Map<string, Set<WebSocket>>();
  return {
    add(userId: string, socket: WebSocket): void {
      const set = sockets.get(userId) ?? new Set<WebSocket>();
      set.add(socket);
      sockets.set(userId, set);
    },
    remove(userId: string, socket: WebSocket): void {
      const set = sockets.get(userId);
      set?.delete(socket);
      if (set?.size === 0) sockets.delete(userId);
    },
    has(userId: string): boolean {
      return (sockets.get(userId)?.size ?? 0) > 0;
    },
    send(userId: string, message: object): void {
      const data = JSON.stringify(message);
      for (const socket of sockets.get(userId) ?? []) {
        if (socket.readyState === socket.OPEN) socket.send(data);
      }
    },
  };
}

export type Hub = ReturnType<typeof createHub>;
