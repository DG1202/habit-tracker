import type { Clock } from './clock.ts';

export interface TokenBucketOptions {
  capacity: number;
  refillPerSecond: number;
}

export function createTokenBucket({ capacity, refillPerSecond }: TokenBucketOptions, clock: Clock) {
  let tokens = capacity;
  let updatedAt = clock.now().getTime();
  return {
    take(): boolean {
      const now = clock.now().getTime();
      tokens = Math.min(capacity, tokens + ((now - updatedAt) / 1000) * refillPerSecond);
      updatedAt = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
