import { describe, expect, it } from 'vitest';
import { resolveCalendarConflict } from './conflict';

describe('resolveCalendarConflict', () => {
  it('selects the only side changed since the last synchronization', () => {
    expect(resolveCalendarConflict('2026-09-16T10:10:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z')).toBe('internal');
    expect(resolveCalendarConflict('2026-09-16T10:00:00Z', '2026-09-16T10:10:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z')).toBe('external');
  });

  it('uses the most recent timestamp when both sides changed', () => {
    expect(resolveCalendarConflict('2026-09-16T10:20:00Z', '2026-09-16T10:10:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z')).toBe('internal');
    expect(resolveCalendarConflict('2026-09-16T10:10:00Z', '2026-09-16T10:20:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z')).toBe('external');
  });

  it('does nothing when neither side changed', () => {
    expect(resolveCalendarConflict('2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z')).toBe('equal');
  });
});
