// Limites de l'API Claude pour les documents envoyés à l'extraction, et
// estimation des tokens AVANT l'appel. Module pur (aucune dépendance Node) :
// utilisable côté navigateur (étape 2 du wizard) et côté serveur.

export const CLAUDE_DOCUMENT_LIMITS = {
  /** Corps total d'une requête Messages (base64 inclus). */
  maxRequestBytes: 32 * 1024 * 1024,
  /** Par image. */
  maxImageBytes: 5 * 1024 * 1024,
  /** Pages de PDF par requête (modèles à 1M de contexte : Sonnet 5.5, Sonnet 4.6, ...). */
  maxPdfPages: 600,
  /** Dimension max d'une image (px). */
  maxImageDimension: 8000,
  /** Fenêtre de contexte des modèles actuels (Sonnet 5.5 : 1M). */
  contextTokens: 1_000_000,
  /** Taille max d'un fichier accepté à l'upload. */
  maxFileBytes: 30 * 1024 * 1024,
} as const;

/** Modèles à 200K de contexte : PDF limités à 100 pages. */
export const SMALL_CONTEXT_LIMITS = { contextTokens: 200_000, maxPdfPages: 100 } as const;

export function isSmallContextModel(model?: string | null): boolean {
  return !!model && (model.startsWith('claude-3-') || model.includes('sonnet-4-5') || model.includes('haiku-4-5'));
}

export interface DocumentCheckOptions {
  maxOutputTokens?: number;
  promptTokens?: number;
  /** Modèle cible : les modèles à 200K ont des limites plus strictes. */
  model?: string | null;
}

/** Tokens consommés par page de PDF (texte + rendu image), borne haute prudente. */
export const TOKENS_PER_PDF_PAGE = 2500;
/** Plafond de tokens pour une image (Claude la redimensionne à ~1568 px). */
export const MAX_TOKENS_PER_IMAGE = 1600;
/** Marge appliquée à l'estimation (elle n'est pas exacte). */
export const TOKEN_ESTIMATE_MARGIN = 1.1;
/** Tokens réservés au prompt texte (consigne + schéma + champs actifs). */
export const DEFAULT_PROMPT_TOKENS = 12_000;
/** Tokens de sortie par défaut (`max_tokens`, thinking inclus). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

export type DocumentKind = 'pdf' | 'image';

export interface DocumentInfo {
  name: string;
  kind: DocumentKind;
  bytes: number;
  /** PDF : nombre de pages (si lisible). */
  pages?: number;
  /** Image : dimensions en pixels (si lisibles). */
  width?: number;
  height?: number;
}

export interface DocumentLimitsResult {
  ok: boolean;
  errors: string[];
  totalBytes: number;
  totalPages: number;
  estimatedTokens: number;
  tokenBudget: number;
}

/** Une requête base64 pèse ~4/3 du fichier d'origine. */
export function base64Size(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function estimateImageTokens(width?: number, height?: number): number {
  if (!width || !height) return MAX_TOKENS_PER_IMAGE;
  return Math.min(MAX_TOKENS_PER_IMAGE, Math.ceil((width * height) / 750));
}

export function estimateDocumentTokens(doc: DocumentInfo): number {
  if (doc.kind === 'image') return estimateImageTokens(doc.width, doc.height);
  // Page inconnue : on suppose le pire cas plutôt que 0.
  return (doc.pages ?? CLAUDE_DOCUMENT_LIMITS.maxPdfPages) * TOKENS_PER_PDF_PAGE;
}

/** Tokens disponibles pour les documents une fois la sortie et le prompt réservés. */
export function documentTokenBudget(options?: DocumentCheckOptions): number {
  const context = isSmallContextModel(options?.model)
    ? SMALL_CONTEXT_LIMITS.contextTokens
    : CLAUDE_DOCUMENT_LIMITS.contextTokens;
  const output = options?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const prompt = options?.promptTokens ?? DEFAULT_PROMPT_TOKENS;
  return Math.max(0, context - output - prompt);
}

export function checkDocumentLimits(
  docs: DocumentInfo[],
  options?: DocumentCheckOptions,
): DocumentLimitsResult {
  const L = {
    ...CLAUDE_DOCUMENT_LIMITS,
    maxPdfPages: isSmallContextModel(options?.model) ? SMALL_CONTEXT_LIMITS.maxPdfPages : CLAUDE_DOCUMENT_LIMITS.maxPdfPages,
  };
  const errors: string[] = [];

  for (const doc of docs) {
    if (doc.kind === 'image') {
      if (doc.bytes > L.maxImageBytes) {
        errors.push(`« ${doc.name} » pèse ${formatMB(doc.bytes)} : une image est limitée à ${formatMB(L.maxImageBytes)}. Réduisez-la ou exportez-la en PDF.`);
      }
      if ((doc.width ?? 0) > L.maxImageDimension || (doc.height ?? 0) > L.maxImageDimension) {
        errors.push(`« ${doc.name} » dépasse ${L.maxImageDimension} px de côté (${doc.width}×${doc.height}).`);
      }
    } else if ((doc.pages ?? 0) > L.maxPdfPages) {
      errors.push(`« ${doc.name} » compte ${doc.pages} pages : un PDF est limité à ${L.maxPdfPages} pages. Découpez-le.`);
    }
  }

  const totalBytes = docs.reduce((sum, d) => sum + d.bytes, 0);
  const totalPages = docs.reduce((sum, d) => sum + (d.kind === 'pdf' ? d.pages ?? 0 : 0), 0);

  if (base64Size(totalBytes) > L.maxRequestBytes) {
    errors.push(
      `Le total des documents (${formatMB(totalBytes)}) dépasse la limite d'envoi (environ ${formatMB(Math.floor(L.maxRequestBytes * 3 / 4))} de fichiers). Retirez des documents.`,
    );
  }
  if (totalPages > L.maxPdfPages) {
    errors.push(`Le total des PDF compte ${totalPages} pages : la limite est de ${L.maxPdfPages} pages par extraction.`);
  }

  const estimatedTokens = Math.ceil(docs.reduce((sum, d) => sum + estimateDocumentTokens(d), 0) * TOKEN_ESTIMATE_MARGIN);
  const tokenBudget = documentTokenBudget(options);
  if (estimatedTokens > tokenBudget) {
    errors.push(
      `Les documents représentent environ ${estimatedTokens.toLocaleString('fr-FR')} tokens, au-delà du maximum de ${tokenBudget.toLocaleString('fr-FR')}. Retirez des pages ou des documents.`,
    );
  }

  return { ok: errors.length === 0, errors, totalBytes, totalPages, estimatedTokens, tokenBudget };
}

/** Erreur levée avant l'appel à Claude : la requête serait refusée ou saturerait le contexte. */
export class DocumentLimitError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'DocumentLimitError';
    this.errors = errors;
  }
}
