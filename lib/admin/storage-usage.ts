/**
 * Volumétrie du stockage par organisation.
 *
 * `storage.objects` n'est pas exposé à l'API REST : tout passe par la fonction
 * SQL `public.admin_storage_usage_by_org()`, exécutable uniquement par
 * `service_role` (voir la migration 2026-09-28_ai_usage_events.sql).
 */

export type StorageUsageRpcRow = {
  organization_id: string | null;
  bucket_id: string;
  /**
   * Fichier produit par l'application (`generated/<orgId>/…`) plutôt que
   * déposé par le client. Le bucket `templates` contient les deux : sans cette
   * distinction, un client avec 2 templates et 25 propositions générées lit
   * « 27 templates ».
   */
  generated: boolean;
  bytes: number;
  objects: number;
};

export type StorageBucketUsage = {
  bucketId: string;
  generated: boolean;
  bytes: number;
  objects: number;
};

export type OrgStorageUsage = {
  /** `null` = fichiers non rattachables à une organisation. */
  organizationId: string | null;
  totalBytes: number;
  totalObjects: number;
  buckets: StorageBucketUsage[];
};

/**
 * `PromiseLike` et non `Promise` : le client Supabase rend un
 * PostgrestFilterBuilder, thenable mais pas une Promise.
 */
export type StorageUsageClient = {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

const UNATTRIBUTED = '__non_attribue__';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function groupStorageUsage(rows: StorageUsageRpcRow[]): OrgStorageUsage[] {
  const groups = new Map<string, OrgStorageUsage>();

  for (const row of rows) {
    const key = row.organization_id ?? UNATTRIBUTED;
    let group = groups.get(key);
    if (!group) {
      group = {
        organizationId: row.organization_id ?? null,
        totalBytes: 0,
        totalObjects: 0,
        buckets: [],
      };
      groups.set(key, group);
    }
    const bytes = toNumber(row.bytes);
    const objects = toNumber(row.objects);
    group.totalBytes += bytes;
    group.totalObjects += objects;
    group.buckets.push({
      bucketId: row.bucket_id,
      generated: row.generated === true,
      bytes,
      objects,
    });
  }

  for (const group of groups.values()) {
    group.buckets.sort((a, b) => b.bytes - a.bytes);
  }

  return [...groups.values()].sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * Lit la volumétrie. Une erreur SQL rend une liste vide : un écran de coûts
 * doit s'afficher même si la fonction de volumétrie n'est pas encore déployée.
 */
export async function fetchStorageUsage(
  client: StorageUsageClient,
  organizationId?: string,
): Promise<OrgStorageUsage[]> {
  try {
    // Filtrer en SQL : une fiche client n'a pas a faire agreger la totalite du
    // stockage de la plateforme pour n'en garder qu'une ligne.
    const { data, error } = await client.rpc('admin_storage_usage_by_org', {
      p_organization_id: organizationId ?? null,
    });
    if (error || !Array.isArray(data)) {
      if (error) console.error('Volumétrie stockage indisponible:', error);
      return [];
    }
    return groupStorageUsage(data as StorageUsageRpcRow[]);
  } catch (error) {
    // La fonction SQL peut ne pas exister (migration pas encore appliquée) :
    // l'écran doit s'afficher sans volumétrie plutôt que tomber en 500.
    console.error('Volumétrie stockage indisponible:', error);
    return [];
  }
}
