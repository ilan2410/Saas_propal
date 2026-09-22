import { describe, expect, it } from 'vitest';
import {
  calendarSettingsSchema,
  propositionNoteCreateSchema,
  propositionNoteEntrySchema,
  propositionNoteUpdateSchema,
} from './validation';

describe('structured proposition note validation', () => {
  it('creates a note from a title only', () => {
    expect(propositionNoteCreateSchema.safeParse({ title: 'Suivi client' }).success).toBe(true);
    expect(propositionNoteCreateSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('accepts a note without reminder or calendar target', () => {
    expect(propositionNoteUpdateSchema.safeParse({
      title: 'Suivi client',
      reminderEnabled: false,
      alertEnabled: false,
      targets: [],
    }).success).toBe(true);
  });

  it('requires scheduling fields when the reminder is active', () => {
    expect(propositionNoteUpdateSchema.safeParse({ title: 'Rappel', reminderEnabled: true }).success).toBe(false);
    expect(propositionNoteUpdateSchema.safeParse({
      title: 'Rappel',
      reminderEnabled: true,
      startsAt: '2026-09-21T09:00:00.000Z',
      timezone: 'Europe/Paris',
      durationMinutes: 30,
      alertEnabled: false,
      targets: [],
    }).success).toBe(true);
  });

  it('normalizes a mini-note to one line', () => {
    const result = propositionNoteEntrySchema.parse({ content: '  Factures\n envoyées   au client  ' });
    expect(result.content).toBe('Factures envoyées au client');
  });

  it('accepts known title variables and rejects unknown ones', () => {
    expect(calendarSettingsSchema.safeParse({ noteTitleTemplate: 'Suivi {client} - {date}' }).success).toBe(true);
    expect(calendarSettingsSchema.safeParse({ noteTitleTemplate: 'Suivi {inconnue}' }).success).toBe(false);
  });
});
