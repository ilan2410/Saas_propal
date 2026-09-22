import { describe, expect, it } from 'vitest';
import {
  formatPlatformEntry,
  parseCalendarDescription,
  parseFlexibleDate,
  reconcileCalendarLines,
  serializeCalendarEntries,
  todayInTimeZone,
} from './note-description';

describe('structured calendar descriptions', () => {
  it('serializes remote and platform formats', () => {
    const entries = [{ entry_date: '2026-09-21', content: 'Envoyé les factures', author_name: 'Corine' }];
    expect(serializeCalendarEntries(entries as never)).toBe('21/09/2026 - Envoyé les factures');
    expect(formatPlatformEntry(entries[0] as never)).toBe('Corine : 21/09/2026 - Envoyé les factures');
  });

  it('parses valid dates and normalizes invalid or missing dates', () => {
    expect(parseCalendarDescription('21/09/2026 - Envoyé\n99/99/2026 - Relancer\nAppeler le client', '2026-09-22')).toEqual([
      { entryDate: '2026-09-21', content: 'Envoyé' },
      { entryDate: '2026-09-22', content: 'Relancer' },
      { entryDate: '2026-09-22', content: 'Appeler le client' },
    ]);
    expect(parseFlexibleDate('2026-02-29')).toBeNull();
    expect(parseFlexibleDate('29/02/2028')).toBe('2028-02-29');
  });

  it('uses the requested timezone for fallback dates', () => {
    expect(todayInTimeZone('Europe/Paris', new Date('2026-09-20T22:30:00Z'))).toBe('2026-09-21');
  });

  it('preserves exact entries and reconciles modifications, additions and deletions', () => {
    const entries = [
      { id: 'a', entry_date: '2026-09-20', content: 'Premier' },
      { id: 'b', entry_date: '2026-09-21', content: 'Deuxième' },
      { id: 'c', entry_date: '2026-09-22', content: 'À supprimer' },
    ];
    const result = reconcileCalendarLines(entries as never, [
      { entryDate: '2026-09-20', content: 'Premier' },
      { entryDate: '2026-09-21', content: 'Deuxième modifié' },
      { entryDate: '2026-09-23', content: 'Nouvelle ligne' },
    ]);
    expect(result.updates).toEqual([
      { id: 'b', entryDate: '2026-09-21', content: 'Deuxième modifié' },
      { id: 'c', entryDate: '2026-09-23', content: 'Nouvelle ligne' },
    ]);
    expect(result.creates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  it('deletes a removed line', () => {
    const result = reconcileCalendarLines([
      { id: 'a', entry_date: '2026-09-20', content: 'Premier' },
      { id: 'b', entry_date: '2026-09-21', content: 'Deuxième' },
    ] as never, [{ entryDate: '2026-09-20', content: 'Premier' }]);
    expect(result.deletes).toEqual(['b']);
  });
});
