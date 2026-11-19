import { z } from 'zod';

export const CONTACT_SECTORS = [
  { value: 'telephonie', label: 'Téléphonie' },
  { value: 'bureautique', label: 'Bureautique' },
  { value: 'les_deux', label: 'Les deux' },
] as const;

export const CONTACT_TEAM_SIZES = [
  { value: '1-5', label: '1 à 5 commerciaux' },
  { value: '6-20', label: '6 à 20 commerciaux' },
  { value: '21-50', label: '21 à 50 commerciaux' },
  { value: '50+', label: 'Plus de 50 commerciaux' },
] as const;

export const CONTACT_STATUSES = ['nouveau', 'traite'] as const;

/** Secteurs pas encore ouverts : affichés grisés, refusés côté serveur. */
export const CONTACT_DISABLED_SECTORS: readonly string[] = ['bureautique'];

export const CONTACT_PREFERENCES = [
  { value: 'email', label: 'Par email' },
  { value: 'phone', label: 'Par téléphone' },
] as const;

export const contactSchema = z
  .object({
  full_name: z.string().trim().min(2, 'Indiquez votre nom et prénom.').max(120),
  contact_preference: z.enum(['email', 'phone'], {
    message: 'Choisissez votre préférence de contact.',
  }),
  email: z.string().trim().email('Adresse email invalide.').max(254).optional(),
  phone: z
    .string()
    .trim()
    .min(6, 'Numéro de téléphone invalide.')
    .max(30, 'Numéro de téléphone invalide.')
    .regex(/^[0-9+().\-\s]+$/, 'Numéro de téléphone invalide.')
    .optional(),
  company: z.string().trim().min(2, "Indiquez le nom de l'entreprise.").max(160),
  sector: z.enum(['telephonie', 'bureautique', 'les_deux'], {
    message: "Choisissez un secteur d'activité.",
  }),
  team_size: z.enum(['1-5', '6-20', '21-50', '50+']).optional(),
  message: z.string().trim().max(500, '500 caractères maximum.').optional(),
  send_confirmation: z.boolean().default(false),
  consent: z.literal(true, { message: 'Votre consentement est nécessaire.' }),
  /** Honeypot : doit rester vide. */
  website: z.string().max(0).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.contact_preference === 'email' && !d.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Indiquez votre adresse email.' });
    }
    if (d.contact_preference === 'phone' && !d.phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Indiquez votre numéro de téléphone.' });
    }
    if (CONTACT_DISABLED_SECTORS.includes(d.sector)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sector'],
        message: "Ce secteur d'activité arrive prochainement.",
      });
    }
  });

export type ContactInput = z.infer<typeof contactSchema>;

export function sectorLabel(value: string): string {
  return CONTACT_SECTORS.find((s) => s.value === value)?.label ?? value;
}

export function teamSizeLabel(value: string | null | undefined): string {
  if (!value) return 'Non renseigné';
  return CONTACT_TEAM_SIZES.find((s) => s.value === value)?.label ?? value;
}
