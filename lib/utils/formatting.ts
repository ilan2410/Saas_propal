// Utilitaires de formatage
/**
 * Formate un montant en euros
 * @param amount - Montant à formater
 * @param decimals - Nombre de décimales
 * @returns Montant formaté
 */
export function formatCurrency(amount: number, decimals: number = 2): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Formate une date en français
 * @param date - Date à formater
 * @param format - Format de sortie
 * @returns Date formatée
 */
export function formatDate(
  date: string | Date,
  format: 'short' | 'long' | 'full' = 'short'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  switch (format) {
    case 'short':
      return new Intl.DateTimeFormat('fr-FR').format(d);
    case 'long':
      return new Intl.DateTimeFormat('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(d);
    case 'full':
      return new Intl.DateTimeFormat('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    default:
      return new Intl.DateTimeFormat('fr-FR').format(d);
  }
}

/**
 * Formate un nombre de tokens
 * @param tokens - Nombre de tokens
 * @returns Tokens formatés
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Formate une taille de fichier
 * @param bytes - Taille en bytes
 * @returns Taille formatée
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Formate un pourcentage
 * @param value - Valeur (0-100)
 * @param decimals - Nombre de décimales
 * @returns Pourcentage formaté
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formate un temps en millisecondes
 * @param ms - Temps en millisecondes
 * @returns Temps formaté
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Tronque un texte
 * @param text - Texte à tronquer
 * @param maxLength - Longueur maximale
 * @returns Texte tronqué
 */
export function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Capitalise la première lettre
 * @param text - Texte à capitaliser
 * @returns Texte capitalisé
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Génère un slug depuis un texte
 * @param text - Texte à slugifier
 * @returns Slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function toSnakeCaseKey(text: string): string {
  return slugify(text).replace(/-/g, '_');
}

/**
 * Normalise un numéro de téléphone français pour un affichage homogène.
 * - 10 chiffres (ex : "0612345678", "06.12.34.56.78") → "06 12 34 56 78"
 * - Format international "+33 6 12 34 56 78" (11 chiffres, indicatif 33) → "06 12 34 56 78"
 * - Toute autre valeur (référence atypique, n° court/long, label non téléphonique)
 *   est conservée telle quelle (espaces multiples simplement réduits).
 * @param raw - Numéro saisi
 * @returns Numéro normalisé
 */
export function normalizePhoneNumber(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');

  // Numéro français standard : 10 chiffres commençant par 0
  if (!hasPlus && digits.length === 10 && digits.startsWith('0')) {
    return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  // Format international +33 X XX XX XX XX
  if (hasPlus && digits.length === 11 && digits.startsWith('33')) {
    const national = '0' + digits.slice(2);
    return national.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  // Sinon : on ne reformate pas, on se contente de réduire les espaces multiples.
  return value.replace(/\s+/g, ' ');
}

/**
 * Masque de saisie « temps réel » pour un champ numéro de téléphone.
 * Pensé pour être appelé dans un onChange : reformate au fur et à mesure de la
 * frappe, en insérant un espace toutes les 2 décimales (max 10 chiffres).
 * - Tolérant : si la valeur contient des lettres (libellé non téléphonique) ou
 *   un « + » (international saisi à la main), elle n'est pas masquée durement.
 * - Le formatage final (ex : +33 → 0…) est assuré par {@link normalizePhoneNumber} au blur.
 * @param value - Valeur courante du champ
 * @returns Valeur masquée
 */
export function maskPhoneInput(value: string): string {
  // Libellé texte → on laisse l'utilisateur saisir librement.
  if (/[A-Za-zÀ-ÿ]/.test(value)) return value;
  // International saisi à la main → on garde chiffres / + / espaces.
  if (value.includes('+')) return value.replace(/[^\d+\s]/g, '').replace(/\s+/g, ' ');
  const digits = value.replace(/\D/g, '').slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
}

/**
 * Formate un secteur
 * @param secteur - Secteur à formater
 * @returns Secteur formaté
 */
export function formatSecteur(
  secteur: 'telephonie' | 'bureautique' | 'mixte'
): string {
  const labels = {
    telephonie: 'Téléphonie',
    bureautique: 'Bureautique',
    mixte: 'Mixte',
  };
  return labels[secteur];
}

/**
 * Formate un statut
 * @param statut - Statut à formater
 * @returns Statut formaté avec couleur
 */
export function formatStatus(
  statut: string
): { label: string; color: string } {
  const statusMap: Record<string, { label: string; color: string }> = {
    brouillon: { label: 'Brouillon', color: 'gray' },
    teste: { label: 'Testé', color: 'blue' },
    actif: { label: 'Actif', color: 'green' },
    processing: { label: 'En cours', color: 'yellow' },
    ready: { label: 'Prêt', color: 'blue' },
    exported: { label: 'Exporté', color: 'green' },
    error: { label: 'Erreur', color: 'red' },
    pending: { label: 'En attente', color: 'yellow' },
    succeeded: { label: 'Réussi', color: 'green' },
    failed: { label: 'Échoué', color: 'red' },
    refunded: { label: 'Remboursé', color: 'orange' },
  };

  return statusMap[statut] || { label: statut, color: 'gray' };
}
