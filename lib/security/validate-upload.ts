// Validation des fichiers uploadés par les utilisateurs : type MIME réel
// (magic bytes, pas le Content-Type déclaré par le client) + taille.
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export type UploadValidationResult =
  | { ok: true; buffer: Buffer; mime: string; extension: string }
  | { ok: false; error: string };

/**
 * Vérifie la taille puis le type MIME réel (magic bytes) d'un fichier uploadé.
 * Le `file.type` fourni par le client n'est jamais utilisé pour la décision :
 * il est falsifiable.
 */
export async function validateUploadedFile(
  file: File,
  allowedMimeTypes: readonly string[],
  maxSizeBytes: number = MAX_UPLOAD_SIZE_BYTES,
): Promise<UploadValidationResult> {
  if (file.size <= 0) {
    return { ok: false, error: 'Fichier vide' };
  }

  if (file.size > maxSizeBytes) {
    return {
      ok: false,
      error: `Le fichier dépasse la taille maximale autorisée (${Math.round(maxSizeBytes / (1024 * 1024))}MB)`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected || !allowedMimeTypes.includes(detected.mime)) {
    return {
      ok: false,
      error: detected
        ? `Type de fichier non autorisé (détecté : ${detected.mime})`
        : 'Type de fichier non reconnu ou non autorisé',
    };
  }

  return { ok: true, buffer, mime: detected.mime, extension: detected.ext };
}

/** Nom de stockage aléatoire, jamais dérivé du nom fourni par le client. */
export function randomStorageFileName(extension: string): string {
  return `${randomUUID()}.${extension}`;
}

/**
 * Nom de stockage = `<uuid>-<nom d'origine assaini>.<extension détectée>`.
 *
 * Le préfixe UUID garantit l'unicité (aucune collision possible) et empêche
 * de deviner l'URL ; le suffixe lisible fait que l'UI et le téléchargement
 * navigateur retrouvent le nom d'origine sans stockage supplémentaire.
 * Le `originalName` fourni par le client n'est utilisé QUE pour ce suffixe,
 * après assainissement strict (ASCII, pas de séparateur de chemin).
 */
export function safeStorageFileName(originalName: string, extension: string): string {
  const base = String(originalName ?? '')
    // Garder le basename : retirer tout ce qui précède un séparateur de chemin.
    .split(/[/\\]/)
    .pop()!
    // Retirer une extension éventuelle (on ajoute l'extension détectée ensuite).
    .replace(/\.[^.]+$/, '');

  // NFD sépare les lettres accentuées de leurs marques combinantes
  // (U+0300–U+036F) ; on retire ces marques puis tout ce qui n'est pas ASCII
  // alphanumérique. « Août » -> « aout ».
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // tout le reste -> tiret
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, ''); // re-nettoie si la troncature laisse un tiret final

  return `${randomUUID()}-${slug || 'fichier'}.${extension}`;
}
