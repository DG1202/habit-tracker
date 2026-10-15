import { HttpErrorResponse } from '@angular/common/http';

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldError[] = [],
  ) {
    super(message);
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    const body = (err.error as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
    if (body && typeof body.code === 'string') {
      const message = typeof body.message === 'string' ? body.message : 'Request failed';
      return new ApiError(err.status, body.code, message, Array.isArray(body.details) ? (body.details as FieldError[]) : []);
    }
    if (err.status === 0) return new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
    return new ApiError(err.status, 'HTTP_ERROR', `Request failed (${err.status})`);
  }
  return new ApiError(0, 'UNKNOWN', 'Something went wrong');
}
