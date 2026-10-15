import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, toApiError } from './api-error';

describe('toApiError', () => {
  it('reads the backend error shape', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'CHECKIN_EXISTS', message: 'Already checked in today', details: [] } },
      }),
    );
    expect(error).toEqual(new ApiError(409, 'CHECKIN_EXISTS', 'Already checked in today', []));
  });

  it('describes network failures', () => {
    expect(toApiError(new HttpErrorResponse({ status: 0 })).message).toBe('Cannot reach the server. Check your connection.');
  });

  it('falls back for unexpected bodies and non-HTTP errors', () => {
    expect(toApiError(new HttpErrorResponse({ status: 502, error: '<html>' })).message).toBe('Request failed (502)');
    expect(toApiError(new Error('boom')).code).toBe('UNKNOWN');
  });
});
