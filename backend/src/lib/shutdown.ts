interface Closable {
  close(): Promise<unknown>;
  log: { error(details: object, message: string): void };
}

export function createShutdown(app: Closable, prisma: { $disconnect(): Promise<void> }, exit: (code: number) => void) {
  let started = false;
  return async (): Promise<void> => {
    if (started) return;
    started = true;
    let code = 0;
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, 'Server shutdown failed');
      code = 1;
    }
    await prisma.$disconnect();
    exit(code);
  };
}
