import { describe, expect, it } from 'vitest';
import { noteToCalendarEvent } from './hash';
import type { PropositionNote, PropositionNoteEntry } from './types';

const note = {
  id: 'note-1',
  organization_id: 'org-1',
  proposition_id: 'prop-1',
  author_user_id: 'user-1',
  structure_version: 2,
  kind: 'reminder',
  title: 'Suivi client',
  content: null,
  starts_at: '2026-09-22T08:00:00.000Z',
  timezone: 'Europe/Paris',
  duration_minutes: 30,
  alert_enabled: true,
  alert_minutes: 15,
  created_at: '2026-09-20T08:00:00.000Z',
  updated_at: '2026-09-21T08:00:00.000Z',
} satisfies PropositionNote;

const entries = [
  { entry_date: '2026-09-20', content: 'Factures envoyées' },
  { entry_date: '2026-09-21', content: 'Client rappelé' },
] as PropositionNoteEntry[];

describe('noteToCalendarEvent', () => {
  it('uses the title and date-text lines for a structured note', () => {
    const event = noteToCalendarEvent(note, 'Client', entries);
    expect(event.title).toBe('Suivi client');
    expect(event.description).toBe('20/09/2026 - Factures envoyées\n21/09/2026 - Client rappelé');
  });
});
