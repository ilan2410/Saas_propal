import { z } from 'zod';
import { unsupportedNoteTitleVariables } from '@/lib/propositions/note-title-template';

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

const titleSchema = z.string().trim().min(1, 'Le titre est requis').max(255);

export const propositionNoteCreateSchema = z.object({
  title: titleSchema,
});

export const propositionNoteUpdateSchema = z.object({
  title: titleSchema,
  reminderEnabled: z.boolean(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().max(100).refine(validTimezone, 'Fuseau horaire invalide').nullable().optional(),
  durationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  alertEnabled: z.boolean().default(false),
  alertMinutes: z.number().int().min(0).max(40320).nullable().optional(),
  targets: z.array(calendarTargetSchema).max(20).default([]),
}).superRefine((value, ctx) => {
  if (!value.reminderEnabled) {
    if (value.targets.length) ctx.addIssue({ code: 'custom', path: ['targets'], message: 'Activez le rappel avant de choisir un agenda' });
    return;
  }
  if (!value.startsAt) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'La date et l’heure sont requises' });
  if (!value.timezone) ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Le fuseau horaire est requis' });
  if (!value.durationMinutes) ctx.addIssue({ code: 'custom', path: ['durationMinutes'], message: 'La durée est requise' });
  if (value.alertEnabled && typeof value.alertMinutes !== 'number') {
    ctx.addIssue({ code: 'custom', path: ['alertMinutes'], message: 'Le délai de rappel est requis' });
  }
});

export const propositionNoteEntrySchema = z.object({
  content: z.string()
    .max(2000)
    .transform((value) => value.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, 'Le texte est requis').max(2000)),
});

export const calendarTargetsSchema = z.array(calendarTargetSchema).max(20);

export const calendarSettingsSchema = z.object({
  timezone: z.string().trim().max(100).refine(validTimezone, 'Fuseau horaire invalide').optional(),
  noteTitleTemplate: z.string().max(255).refine(
    (value) => unsupportedNoteTitleVariables(value).length === 0,
    'Le modèle contient une variable inconnue',
  ).optional(),
}).refine((value) => value.timezone !== undefined || value.noteTitleTemplate !== undefined, 'Aucun paramètre à enregistrer');

export type PropositionNoteCreateInput = z.infer<typeof propositionNoteCreateSchema>;
export type PropositionNoteUpdateInput = z.infer<typeof propositionNoteUpdateSchema>;
export type PropositionNoteEntryInput = z.infer<typeof propositionNoteEntrySchema>;
