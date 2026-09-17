import { describe, expect, it } from 'vitest';
import { propositionNoteInputSchema } from './validation';

describe('propositionNoteInputSchema', () => {
  it('accepts an independent note without calendar target', () => {
    const result = propositionNoteInputSchema.safeParse({ kind: 'note', content: 'Rappeler le client', targets: [] });
    expect(result.success).toBe(true);
  });

  it('accepts an independent reminder without calendar target', () => {
    const result = propositionNoteInputSchema.safeParse({
      kind: 'reminder',
      title: 'Envoyer la proposition',
      startsAt: '2026-09-17T09:00:00.000Z',
      timezone: 'Europe/Paris',
      durationMinutes: 30,
      alertEnabled: false,
      targets: [],
    });
    expect(result.success).toBe(true);
  });

  it('requires reminder scheduling fields and rejects targets on a simple note', () => {
    expect(propositionNoteInputSchema.safeParse({ kind: 'reminder', title: 'Rappel' }).success).toBe(false);
    expect(propositionNoteInputSchema.safeParse({
      kind: 'note',
      content: 'Texte',
      targets: [{ connectionId: '8dc8542d-e3d4-4fc7-9243-7fd2c9ba2ec1', provider: 'google', calendarId: 'primary' }],
    }).success).toBe(false);
  });
});
