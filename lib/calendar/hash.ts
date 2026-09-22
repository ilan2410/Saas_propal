import { createHash } from 'node:crypto';
import { serializeCalendarEntries } from './note-description';
import type { CalendarEventInput, PropositionNote, PropositionNoteEntry } from './types';

export function noteToCalendarEvent(
  note: PropositionNote,
  clientName: string,
  entries: PropositionNoteEntry[] = [],
): CalendarEventInput {
  if (note.kind !== 'reminder' || !note.title || !note.starts_at || !note.timezone || !note.duration_minutes) {
    throw new Error('Invalid reminder');
  }
  const description = note.structure_version === 2
    ? serializeCalendarEntries(entries)
    : [
        `Client : ${clientName || 'Sans nom'}`,
        `Proposition : ${note.proposition_id}`,
        '',
        note.content ?? '',
      ].join('\n');
  return {
    noteId: note.id,
    title: note.title,
    description,
    startsAt: note.starts_at,
    timezone: note.timezone,
    durationMinutes: note.duration_minutes,
    alertEnabled: note.alert_enabled,
    alertMinutes: note.alert_minutes,
  };
}

export function calendarEventHash(event: CalendarEventInput): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}
