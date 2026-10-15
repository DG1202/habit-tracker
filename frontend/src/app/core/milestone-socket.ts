import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { MilestoneMessage } from './models';
import { ToastService } from './toast-service';

export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>('WEB_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => new WebSocket(url),
});

export type SocketStatus = 'disconnected' | 'connecting' | 'connected';

const OPEN = 1;
const MAX_BACKOFF_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class MilestoneSocket {
  private readonly createSocket = inject(WEB_SOCKET_FACTORY);
  private readonly toasts = inject(ToastService);
  private readonly state = signal<SocketStatus>('disconnected');
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAcks: string[] = [];
  private attempts = 0;
  private active = false;

  readonly status = this.state.asReadonly();

  connect(): void {
    if (this.active) return;
    this.active = true;
    this.open();
  }

  disconnect(): void {
    this.active = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.attempts = 0;
    this.pendingAcks = [];
    this.toasts.clearMilestones();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.state.set('disconnected');
  }

  private open(): void {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = this.createSocket(`${protocol}://${location.host}/ws`);
    this.socket = socket;
    this.state.set('connecting');

    socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', topics: ['milestones'] }));
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket === socket) this.handle(event.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.state.set('disconnected');
      if (this.active) this.scheduleReconnect();
    };
  }

  private handle(data: unknown): void {
    if (typeof data !== 'string') return;
    let message: { type?: unknown };
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (message.type === 'subscribed') {
      this.attempts = 0;
      this.state.set('connected');
      this.flushAcks();
    } else if (message.type === 'milestone') {
      const milestone = message as MilestoneMessage;
      this.toasts.show({
        kind: 'milestone',
        title: `${milestone.milestone}-day streak!`,
        message: `“${milestone.habitName}” — ${milestone.currentStreak} days in a row. Keep it going!`,
        onDismiss: () => this.ack(milestone.id),
      });
    }
  }

  private ack(id: string): void {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify({ type: 'ack', id }));
    else this.pendingAcks.push(id);
  }

  private flushAcks(): void {
    const ids = this.pendingAcks;
    this.pendingAcks = [];
    ids.forEach((id) => this.ack(id));
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.active) this.open();
    }, delay);
  }
}
