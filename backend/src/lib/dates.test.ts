import { describe, expect, it } from 'vitest';
import { addDays, isValidDate, isValidTimeZone, todayIn } from './dates.ts';

describe('dates', () => {
  it.each([
    ['2026-10-15', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['', false],
    ['2026-10-15T00:00:00Z', false],
  ])('isValidDate(%j) is %s', (value, expected) => {
    expect(isValidDate(value)).toBe(expected);
  });

  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Europe/Kyiv')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('computes today in the user time zone, not UTC', () => {
    const now = new Date('2026-10-15T22:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-10-15');
    expect(todayIn('Europe/Kyiv', now)).toBe('2026-10-16');
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-10-15');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
