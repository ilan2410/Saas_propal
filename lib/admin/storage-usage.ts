/**
 * Volumétrie du stockage par organisation, classée par catégorie métier.
 *
 * `storage.objects` n'est pas exposé à l'API REST : tout passe par la fonction
 * SQL `public.admin_storage_usage_by_org()`, exécutable uniquement par
 * `service_role` (supabase/migrations/2026-09-30_storage_usage_categories.sql).
 *
 * La fonction rend des CATÉGORIES, pas des buckets : un bucket est de la
 * plomberie — `templates` contient aussi toutes les propositions générées — et
 * l'afficher tel quel oblige le lecteur à la connaître.
 */

/** Ordre d'affichage. Les anomalies ferment la liste. */
export const STORAGE_CATEGORY_ORDER = [
  'pieces_jointes',
  'propositions_generees',
  'templates',
  'logos',
  'images_catalogue',
  'orphelins',
  'autres',
] as const;

export type StorageCategory = (typeof STORAGE_CATEGORY_ORDER)[number];

export type StorageUsageRpcRow = {
  organization_id: string | null;
  /**
   * Une des valeurs de STORAGE_CATEGORY_ORDER, ou une catégorie plus récente
   * que ce code : elle est conservée et rangée en fin de liste.
   */
  categorie: string;
  bytes: number;
  objects: number;
};

export type StorageCategoryUsage = {
  category: string;
  bytes: number;
  objects: number;
};

export type OrgStorageUsage = {
  /** `null` = fichiers non rattachables à une organisation. */
  organizationId: string | null;
  totalBytes: number;
  totalObjects: number;
  categories: StorageCategoryUsage[];
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

/** Une catégorie inconnue de ce code passe en fin de liste plutôt que d'être perdue. */
function categoryRank(category: string): number {
  const index = (STORAGE_CATEGORY_ORDER as readonly string[]).indexOf(category);
  return index === -1 ? STORAGE_CATEGORY_ORDER.length : index;
}

export function groupStorageUsage(rows: StorageUsageRpcRow[]): OrgStorageUsage[] {
  const groups = new Map<
    string,
    { organizationId: string | null; totalBytes: number; totalObjects: number; parCategorie: Map<string, StorageCategoryUsage> }
  >();

  for (const row of rows) {
    const key = row.organization_id ?? UNATTRIBUTED;
    let group = groups.get(key);
    if (!group) {
      group = {
        organizationId: row.organization_id ?? null,
        totalBytes: 0,
        totalObjects: 0,
        parCategorie: new Map(),
      };
      groups.set(key, group);
    }

    const bytes = toNumber(row.bytes);
    const objects = toNumber(row.objects);
    group.totalBytes += bytes;
    group.totalObjects += objects;

    // Une même catégorie peut venir de plusieurs buckets (les pièces jointes
    // notamment) : elle doit rester une seule ligne.
    const existing = group.parCategorie.get(row.categorie);
    if (existing) {
      existing.bytes += bytes;
      existing.objects += objects;
    } else {
      group.parCategorie.set(row.categorie, { category: row.categorie, bytes, objects });
    }
  }

  return [...groups.values()]
    .map(({ parCategorie, ...group }) => ({
      ...group,
      categories: [...parCategorie.values()].sort(
        (a, b) => categoryRank(a.category) - categoryRank(b.category) || b.bytes - a.bytes,
      ),
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes);
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
    // Filtrer en SQL : une fiche client n'a pas à faire agréger la totalité du
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
