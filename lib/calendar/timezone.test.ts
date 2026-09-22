import { describe, expect, it } from 'vitest';
import { utcToZonedLocalInput, zonedLocalDateTimeToUtc } from './timezone';

describe('calendar timezone conversion', () => {
  it('converts summer and winter Paris times to UTC', () => {
    expect(zonedLocalDateTimeToUtc('2026-07-15T09:00', 'Europe/Paris')).toBe('2026-07-15T07:00:00.000Z');
    expect(zonedLocalDateTimeToUtc('2026-12-15T09:00', 'Europe/Paris')).toBe('2026-12-15T08:00:00.000Z');
  });

  it('round-trips a UTC instant into the selected timezone', () => {
    expect(utcToZonedLocalInput('2026-09-16T13:30:00.000Z', 'America/Montreal')).toBe('2026-09-16T09:30');
  });

  it('rejects a local time skipped by daylight saving time', () => {
    expect(() => zonedLocalDateTimeToUtc('2026-03-29T02:30', 'Europe/Paris')).toThrow();
  });
});
