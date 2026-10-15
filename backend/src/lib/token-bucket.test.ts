import { describe, expect, it } from 'vitest';
import { createTokenBucket } from './token-bucket.ts';

describe('createTokenBucket', () => {
  it('allows a burst up to capacity, then refills over time without exceeding capacity', () => {
    const clock = { current: new Date('2026-10-15T12:00:00.000Z'), now() { return this.current; } };
    const bucket = createTokenBucket({ capacity: 3, refillPerSecond: 2 }, clock);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);

    clock.current = new Date('2026-10-15T12:00:00.500Z');
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);

    clock.current = new Date('2026-10-15T12:01:00.000Z');
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
  });
});
