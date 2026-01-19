// Schémas de validation Zod
import { z } from 'zod';

// Validation pour la création d'une organization
export const organizationSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  secteur: z.enum(['telephonie', 'bureautique', 'mixte']),
  claude_model: z.string().min(1, 'Le modèle est requis'),
  prompt_template: z.string().min(50, 'Le prompt doit contenir au moins 50 caractères'),
  tarif_par_proposition: z.number().positive('Le tarif doit être positif'),
});

export type OrganizationFormData = z.infer<typeof organizationSchema>;

// Validation pour la création d'un template
export const templateSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  description: z.string().optional(),
  champs_actifs: z.array(z.string()).min(1, 'Au moins un champ doit être sélectionné'),
  file_type: z.enum(['excel', 'word', 'pdf']),
});

export type TemplateFormData = z.infer<typeof templateSchema>;

// Validation pour la recharge de crédits
export const creditRechargeSchema = z.object({
  amount: z.number().min(1, 'Le montant minimum est 1€').max(10000, 'Le montant maximum est 10000€'),
});

export type CreditRechargeData = z.infer<typeof creditRechargeSchema>;

// Validation pour l'upload de fichiers
export const fileUploadSchema = z.object({
  file: z.instanceof(File),
  maxSizeMB: z.number().default(50),
  allowedTypes: z.array(z.string()).default([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
});

/**
 * Valide un fichier uploadé
 * @param file - Fichier à valider
 * @param maxSizeMB - Taille maximale en MB
 * @param allowedTypes - Types MIME autorisés
 * @returns true si valide, sinon erreur
 */
export function validateFile(
  file: File,
  maxSizeMB: number = 50,
  allowedTypes: string[] = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]
): { valid: boolean; error?: string } {
  // Vérifier la taille
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `Le fichier est trop volumineux (${fileSizeMB.toFixed(2)} MB). Maximum : ${maxSizeMB} MB`,
    };
  }

  // Vérifier le type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Type de fichier non autorisé (${file.type})`,
    };
  }

  return { valid: true };
}

/**
 * Valide un email
 * @param email - Email à valider
 * @returns true si valide
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valide un mot de passe
 * @param password - Mot de passe à valider
 * @returns Objet avec validité et messages d'erreur
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Le mot de passe doit contenir au moins 8 caractères');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une minuscule');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Valide un montant de crédits
 * @param amount - Montant à valider
 * @returns true si valide
 */
export function validateCreditAmount(amount: number): boolean {
  return amount >= 1 && amount <= 10000;
}
