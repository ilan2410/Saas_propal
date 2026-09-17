import { z } from 'zod';

export const calendarTargetSchema = z.object({
  connectionId: z.string().uuid(),
  provider: z.enum(['google', 'microsoft']),
  calendarId: z.string().trim().min(1).max(1024),
  calendarName: z.string().trim().max(255).optional(),
});

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const propositionNoteInputSchema = z.object({
  kind: z.enum(['note', 'reminder']),
  title: z.string().trim().max(255).nullable().optional(),
  content: z.string().trim().max(10000).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().max(100).refine(validTimezone, 'Fuseau horaire invalide').nullable().optional(),
  durationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  alertEnabled: z.boolean().default(false),
  alertMinutes: z.number().int().min(0).max(40320).nullable().optional(),
  targets: z.array(calendarTargetSchema).max(20).default([]),
}).superRefine((value, ctx) => {
  if (value.kind === 'note' && !value.content) {
    ctx.addIssue({ code: 'custom', path: ['content'], message: 'Le contenu de la note est requis' });
  }
  if (value.kind === 'reminder') {
    if (!value.title) ctx.addIssue({ code: 'custom', path: ['title'], message: 'Le titre est requis' });
    if (!value.startsAt) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'La date et l’heure sont requises' });
    if (!value.timezone) ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Le fuseau horaire est requis' });
    if (!value.durationMinutes) ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'La durée est requise' });
    if (value.alertEnabled && typeof value.alertMinutes !== 'number') {
      ctx.addIssue({ code: 'custom', path: ['alertMinutes'], message: 'Le délai de rappel est requis' });
    }
  }
  if (value.kind === 'note' && value.targets.length) {
    ctx.addIssue({ code: 'custom', path: ['targets'], message: 'Une note simple ne peut pas être synchronisée' });
  }
});

export const calendarTargetsSchema = z.array(calendarTargetSchema).max(20);

export const calendarSettingsSchema = z.object({
  timezone: z.string().trim().max(100).refine(validTimezone, 'Fuseau horaire invalide'),
});

export type PropositionNoteInput = z.infer<typeof propositionNoteInputSchema>;
