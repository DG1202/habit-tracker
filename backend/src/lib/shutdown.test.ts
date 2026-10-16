import { describe, expect, it, vi } from 'vitest';
import { createShutdown } from './shutdown.ts';

describe('createShutdown', () => {
  const setup = (closeError?: Error, disconnectError?: Error) => {
    const app = { close: vi.fn(async () => { if (closeError) throw closeError; }), log: { error: vi.fn() } };
    const prisma = { $disconnect: vi.fn(async () => { if (disconnectError) throw disconnectError; }) };
    const exit = vi.fn();
    return { app, prisma, exit, shutdown: createShutdown(app, prisma, exit) };
  };

  it('closes the server and the database once, however many signals arrive', async () => {
    const { app, prisma, exit, shutdown } = setup();
    await Promise.all([shutdown(), shutdown()]);
    expect(app.close).toHaveBeenCalledOnce();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('still disconnects and exits with 1 when closing the server fails', async () => {
    const { app, prisma, exit, shutdown } = setup(new Error('close failed'));
    await shutdown();
    expect(app.log.error).toHaveBeenCalledOnce();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('logs a failed disconnect and still exits with 1', async () => {
    const error = new Error('disconnect failed');
    const { app, exit, shutdown } = setup(undefined, error);
    await shutdown();
    expect(app.log.error).toHaveBeenCalledExactlyOnceWith({ err: error }, 'Database disconnect failed');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
