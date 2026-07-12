/**
 * Détermine si un type de fichier de template supporte le workflow SP
 * (Situation Proposée). Historiquement réservé à Word, désormais ouvert à Excel.
 *
 * Centralisé ici pour éviter la dérive entre les multiples points de gating
 * (managers de réglages SP, étape questionnaire SP du wizard de proposition…).
 */
export function supportsSp(fileType?: string | null): boolean {
  return fileType === 'word' || fileType === 'excel';
}
