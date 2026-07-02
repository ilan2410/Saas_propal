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
