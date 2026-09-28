/**
 * Fichiers de stockage que plus rien ne référence.
 *
 * La liste vient de `public.admin_orphan_files()`, qui dérive de la même
 * classification que la volumétrie affichée : une seule définition
 * d'« orphelin », côté base. C'est celle qui sert à supprimer, donc celle qu'on
 * ne peut pas se permettre d'avoir fausse.
 */

export type OrphanFileRow = {
  organization_id: string | null;
  bucket_id: string;
  /** Clé de stockage, relative au bucket. */
  name: string;
  bytes: number;
};

export type OrphanSummary = {
  files: number;
  bytes: number;
};

export type OrphanDeletionBatch = {
  bucket: string;
  keys: string[];
};

/** Taille de lot par défaut pour les appels de suppression au Storage. */
const DEFAULT_BATCH_SIZE = 100;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeOrphans(rows: OrphanFileRow[]): OrphanSummary {
  return rows.reduce<OrphanSummary>(
    (acc, row) => ({ files: acc.files + 1, bytes: acc.bytes + toNumber(row.bytes) }),
    { files: 0, bytes: 0 },
  );
}

/**
 * Regroupe les clés par bucket et par lots bornés : une organisation observée
 * portait 192 orphelins, et rien ne borne ce nombre.
 */
export function groupOrphansByBucket(
  rows: OrphanFileRow[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): OrphanDeletionBatch[] {
  const parBucket = new Map<string, string[]>();
  for (const row of rows) {
    const keys = parBucket.get(row.bucket_id);
    if (keys) keys.push(row.name);
    else parBucket.set(row.bucket_id, [row.name]);
  }

  const batches: OrphanDeletionBatch[] = [];
  for (const [bucket, keys] of parBucket) {
    for (let index = 0; index < keys.length; index += batchSize) {
      batches.push({ bucket, keys: keys.slice(index, index + batchSize) });
    }
  }
  return batches;
}
