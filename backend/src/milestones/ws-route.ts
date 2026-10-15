import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { isAllowedOrigin, type Config } from '../config.ts';
import type { Clock } from '../lib/clock.ts';
import { AppError } from '../lib/errors.ts';
import { createTokenBucket } from '../lib/token-bucket.ts';
import { SESSION_ENDED_CLOSE_CODE, type Hub, type ServerFrame } from './hub.ts';
import type { MilestoneNotifier, MilestoneService } from './service.ts';

const ClientMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('subscribe'), topics: z.array(z.literal('milestones')).min(1) }),
  z.strictObject({ type: z.literal('ack'), id: z.string().min(1).max(64) }),
]);

const FRAME_RATE = { capacity: 20, refillPerSecond: 5 };
const MAX_CONSECUTIVE_LIMITED = 10;
const RATE_LIMITED_CLOSE_CODE = 1008;

const send = (socket: WebSocket, message: ServerFrame) => socket.send(JSON.stringify(message));

function parse(raw: Buffer, isBinary: boolean) {
  if (isBinary) return null;
  try {
    const result = ClientMessage.safeParse(JSON.parse(raw.toString('utf8')));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface WsRouteDeps {
  config: Config;
  clock: Clock;
  hub: Hub;
  milestones: MilestoneService;
  notifier: MilestoneNotifier;
}

export async function wsRoutes(app: FastifyInstance, { config, clock, hub, milestones, notifier }: WsRouteDeps) {
  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (request) => {
        if (!isAllowedOrigin(request.headers.origin, config)) throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Origin not allowed');
      },
    },
    (socket, request) => {
      // Browsers only expose close codes, so a missing or expired session is reported as 4401 after the upgrade.
      if (!request.user || !request.session) {
        socket.close(SESSION_ENDED_CLOSE_CODE, 'Session ended');
        return;
      }
      const userId = request.user.id;
      hub.add(userId, socket, request.session);
      // Repeated subscribes share the first evaluation; later milestones arrive through check-ins.
      let subscribed: Promise<void> | null = null;
      const frames = createTokenBucket(FRAME_RATE, clock);
      let limitedInARow = 0;

      socket.on('message', async (raw: Buffer, isBinary: boolean) => {
        if (!hub.isLive(userId, socket)) return;
        if (!frames.take()) {
          if (++limitedInARow >= MAX_CONSECUTIVE_LIMITED) {
            socket.close(RATE_LIMITED_CLOSE_CODE, 'Too many messages');
            return;
          }
          send(socket, { type: 'error', code: 'RATE_LIMITED', message: 'Too many messages. Slow down.' });
          return;
        }
        limitedInARow = 0;
        const message = parse(raw, isBinary);
        if (!message) {
          send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Expected {"type":"subscribe","topics":["milestones"]} or {"type":"ack","id":"…"}' });
          return;
        }
        try {
          switch (message.type) {
            case 'subscribe':
              if (!subscribed) {
                hub.subscribe(userId, socket);
                subscribed = notifier.notifyUser(userId).catch((error: unknown) => {
                  subscribed = null;
                  throw error;
                });
              }
              // Sent last so clients (and tests) can treat it as "pending milestones have been delivered".
              await subscribed;
              send(socket, { type: 'subscribed', topics: ['milestones'] });
              break;
            case 'ack':
              if (await milestones.ack(userId, message.id)) send(socket, { type: 'acked', id: message.id });
              else send(socket, { type: 'error', code: 'NOT_FOUND', message: 'Notification not found' });
              break;
            default:
              message satisfies never;
          }
        } catch (error) {
          request.log.error({ err: error }, 'WebSocket message handling failed');
          send(socket, { type: 'error', code: 'INTERNAL', message: 'Something went wrong' });
        }
      });

      socket.on('close', () => hub.remove(userId, socket));
    },
  );
}
