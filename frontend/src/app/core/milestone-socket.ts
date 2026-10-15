import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth-store';
import type { MilestoneMessage } from './models';
import { ToastService } from './toast-service';

export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>('WEB_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => new WebSocket(url),
});

export type SocketStatus = 'disconnected' | 'connecting' | 'connected';

const OPEN = 1;
// Must match SESSION_ENDED_CLOSE_CODE in backend/src/milestones/hub.ts.
const SESSION_ENDED = 4401;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
// The server refills 5 frames/s per socket; 4 acks/s stays under it however many toasts are dismissed.
const ACK_INTERVAL_MS = 250;

export function socketUrl({ protocol, host }: Pick<Location, 'protocol' | 'host'>): string {
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

function isMilestone(frame: Record<string, unknown>): frame is Record<string, unknown> & MilestoneMessage {
  return (
    frame['type'] === 'milestone' &&
    typeof frame['id'] === 'string' &&
    typeof frame['habitId'] === 'string' &&
    typeof frame['habitName'] === 'string' &&
    typeof frame['milestone'] === 'number' &&
    typeof frame['currentStreak'] === 'number'
  );
}

@Injectable({ providedIn: 'root' })
export class MilestoneSocket {
  private readonly createSocket = inject(WEB_SOCKET_FACTORY);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly state = signal<SocketStatus>('disconnected');
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAcks: string[] = [];
  private attempts = 0;
  private userId: string | null = null;

  readonly status = this.state.asReadonly();

  connect(userId: string): void {
    if (this.userId === userId) return;
    if (this.userId !== null) this.disconnect();
    this.userId = userId;
    this.open();
  }

  disconnect(): void {
    this.userId = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopAckTimer();
    this.attempts = 0;
    this.pendingAcks = [];
    this.toasts.clear();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.state.set('disconnected');
  }

  private open(): void {
    const socket = this.createSocket(socketUrl(location));
    this.socket = socket;
    this.state.set('connecting');

    socket.onopen = () => {
      if (this.socket === socket) socket.send(JSON.stringify({ type: 'subscribe', topics: ['milestones'] }));
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket === socket) this.handle(event.data);
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopAckTimer();
      this.state.set('disconnected');
      if (event.code === SESSION_ENDED) {
        this.auth.clear();
        this.disconnect();
        void this.router.navigate(['/login']);
      } else if (this.userId !== null) {
        this.scheduleReconnect();
      }
    };
  }

  private handle(data: unknown): void {
    if (typeof data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const frame = parsed as Record<string, unknown>;
    if (frame['type'] === 'subscribed') {
      this.attempts = 0;
      this.state.set('connected');
      this.sendNextAck();
    } else if (isMilestone(frame)) {
      const id = frame.id;
      this.toasts.show({
        kind: 'milestone',
        title: `${frame.milestone}-day streak!`,
        message: `“${frame.habitName}” — ${frame.currentStreak} days in a row. Keep it going!`,
        onDismiss: () => this.ack(id),
      });
    }
  }

  private ack(id: string): void {
    this.pendingAcks.push(id);
    this.sendNextAck();
  }

  private sendNextAck(): void {
    if (this.ackTimer || this.socket?.readyState !== OPEN) return;
    const id = this.pendingAcks.shift();
    if (id === undefined) return;
    this.socket.send(JSON.stringify({ type: 'ack', id }));
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      this.sendNextAck();
    }, ACK_INTERVAL_MS);
  }

  private stopAckTimer(): void {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
  }

  private scheduleReconnect(): void {
    const step = Math.min(BASE_BACKOFF_MS * 2 ** this.attempts, MAX_BACKOFF_MS);
    const delay = Math.round(step * (0.5 + Math.random() / 2));
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.userId !== null) this.open();
    }, delay);
  }
}
