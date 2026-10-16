import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export interface FieldError {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details: FieldError[] = [],
  ) {
    super(message);
  }
}

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

function body(code: string, message: string, details: FieldError[] = []) {
  return { error: { code, message, details } };
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(body(error.code, error.message, error.details));
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
    return reply.status(400).send(body('VALIDATION_ERROR', details[0]?.message ?? 'Invalid request', details));
  }
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (statusCode < 500) {
    const code = statusCode === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'BAD_REQUEST';
    return reply.status(statusCode).send(body(code, error.message));
  }
  request.log.error({ err: error }, 'Unhandled error');
  return reply.status(500).send(body('INTERNAL', 'Something went wrong. Please try again.'));
}
