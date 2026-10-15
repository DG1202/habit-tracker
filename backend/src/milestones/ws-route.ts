import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { currentSession, currentUser } from '../auth/current-user.ts';
import type { Config } from '../config.ts';
import { AppError } from '../lib/errors.ts';
import type { Hub } from './hub.ts';
import type { MilestoneNotifier, MilestoneService } from './service.ts';

const ClientMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('subscribe'), topics: z.array(z.literal('milestones')).min(1) }),
  z.strictObject({ type: z.literal('ack'), id: z.string().min(1).max(64) }),
]);

const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify(message));

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
  hub: Hub;
  milestones: MilestoneService;
  notifier: MilestoneNotifier;
}

export async function wsRoutes(app: FastifyInstance, { config, hub, milestones, notifier }: WsRouteDeps) {
  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (request) => {
        if (request.headers.origin !== config.APP_ORIGIN) throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Origin not allowed');
        currentUser(request);
      },
    },
    (socket, request) => {
      const userId = currentUser(request).id;
      hub.add(userId, socket, currentSession(request));

      socket.on('message', async (raw: Buffer, isBinary: boolean) => {
        if (!hub.isLive(userId, socket)) return;
        const message = parse(raw, isBinary);
        if (!message) {
          send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Expected {"type":"subscribe","topics":["milestones"]} or {"type":"ack","id":"…"}' });
          return;
        }
        try {
          if (message.type === 'subscribe') {
            hub.subscribe(userId, socket);
            send(socket, { type: 'subscribed', topics: ['milestones'] });
            await notifier.notifyUser(userId);
          } else if (await milestones.ack(userId, message.id)) {
            send(socket, { type: 'acked', id: message.id });
          } else {
            send(socket, { type: 'error', code: 'NOT_FOUND', message: 'Notification not found' });
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
