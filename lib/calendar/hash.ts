import { createHash } from 'node:crypto';
import type { CalendarEventInput, PropositionNote } from './types';

export function noteToCalendarEvent(note: PropositionNote, clientName: string): CalendarEventInput {
  if (note.kind !== 'reminder' || !note.title || !note.starts_at || !note.timezone || !note.duration_minutes) {
    throw new Error('Invalid reminder');
  }
  const context = [
    `Client : ${clientName || 'Sans nom'}`,
    `Proposition : ${note.proposition_id}`,
    '',
    note.content ?? '',
  ];
  return {
    noteId: note.id,
    title: note.title,
    description: context.join('\n'),
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
