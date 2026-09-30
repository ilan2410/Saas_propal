import { describe, expect, it } from 'vitest';
import { fetchStorageUsage, groupStorageUsage, type StorageUsageRpcRow } from './storage-usage';

function row(overrides: Partial<StorageUsageRpcRow> = {}): StorageUsageRpcRow {
  return {
    organization_id: 'org-1',
    categorie: 'templates',
    bytes: 1000,
    objects: 1,
    ...overrides,
  };
}

describe('groupStorageUsage', () => {
  it('regroupe les catégories par organisation et totalise', () => {
    const result = groupStorageUsage([
      row({ organization_id: 'org-1', categorie: 'pieces_jointes', bytes: 1000, objects: 2 }),
      row({ organization_id: 'org-1', categorie: 'templates', bytes: 500, objects: 1 }),
      row({ organization_id: 'org-2', categorie: 'pieces_jointes', bytes: 200, objects: 1 }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].organizationId).toBe('org-1');
    expect(result[0].totalBytes).toBe(1500);
    expect(result[0].totalObjects).toBe(3);
    expect(result[0].categories).toHaveLength(2);
  });

  it('trie les organisations du plus gros au plus petit', () => {
    const result = groupStorageUsage([
      row({ organization_id: 'petit', bytes: 10 }),
      row({ organization_id: 'gros', bytes: 10_000 }),
    ]);

    expect(result.map((item) => item.organizationId)).toEqual(['gros', 'petit']);
  });

  it('conserve les fichiers non attribués sous organizationId null', () => {
    const result = groupStorageUsage([
      row({ organization_id: null, categorie: 'autres', bytes: 4242, objects: 7 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBeNull();
    expect(result[0].totalBytes).toBe(4242);
  });

  it('traite une taille absente comme zéro', () => {
    const result = groupStorageUsage([
      { organization_id: 'org-1', categorie: 'templates', bytes: null, objects: 1 },
    ] as unknown as StorageUsageRpcRow[]);

    expect(result[0].totalBytes).toBe(0);
    expect(result[0].totalObjects).toBe(1);
  });

  it('additionne deux lignes de même catégorie', () => {
    // Les pièces jointes viennent de deux buckets distincts : elles doivent
    // apparaître sur une seule ligne, pas deux.
    const result = groupStorageUsage([
      row({ categorie: 'pieces_jointes', bytes: 100, objects: 1 }),
      row({ categorie: 'pieces_jointes', bytes: 400, objects: 3 }),
    ]);

    expect(result[0].categories).toHaveLength(1);
    expect(result[0].categories[0].bytes).toBe(500);
    expect(result[0].categories[0].objects).toBe(4);
  });

  it('classe les catégories dans un ordre métier stable, anomalies en fin', () => {
    // Un ordre fixe rend deux fiches clients comparables d'un coup d'œil et
    // laisse les anomalies (orphelins, non classés) en bas.
    const result = groupStorageUsage([
      row({ categorie: 'autres', bytes: 9_000_000 }),
      row({ categorie: 'orphelins', bytes: 8_000_000 }),
      row({ categorie: 'logos', bytes: 10 }),
      row({ categorie: 'templates', bytes: 20 }),
      row({ categorie: 'propositions_generees', bytes: 30 }),
      row({ categorie: 'pieces_jointes', bytes: 40 }),
    ]);

    expect(result[0].categories.map((c) => c.category)).toEqual([
      'pieces_jointes',
      'propositions_generees',
      'templates',
      'logos',
      'orphelins',
      'autres',
    ]);
  });

  it('range une catégorie inconnue en fin de liste sans la perdre', () => {
    const result = groupStorageUsage([
      row({ categorie: 'templates', bytes: 20, objects: 1 }),
      row({ categorie: 'categorie_future', bytes: 50, objects: 2 }),
    ]);

    expect(result[0].totalObjects).toBe(3);
    expect(result[0].categories.at(-1)?.category).toBe('categorie_future');
  });
});

describe('fetchStorageUsage', () => {
  it('appelle la fonction SQL et regroupe le résultat', async () => {
    const appels: string[] = [];
    const client = {
      async rpc(name: string) {
        appels.push(name);
        return {
          data: [{ organization_id: 'org-1', categorie: 'templates', bytes: 10, objects: 1 }],
          error: null,
        };
      },
    };

    const result = await fetchStorageUsage(client);

    expect(appels).toEqual(['admin_storage_usage_by_org']);
    expect(result[0].totalBytes).toBe(10);
  });

  it('rend une liste vide et ne lève pas si la fonction SQL échoue', async () => {
    const client = {
      async rpc() {
        return { data: null, error: { message: 'permission denied' } };
      },
    };

    await expect(fetchStorageUsage(client)).resolves.toEqual([]);
  });

  it('transmet l’organisation à la fonction SQL au lieu de tout scanner', async () => {
    // Sans ce paramètre, l'ouverture d'une fiche client agrège la totalité du
    // stockage de la plateforme pour n'en garder qu'une ligne.
    let params: unknown = 'jamais appelé';
    const client = {
      async rpc(_name: string, args?: Record<string, unknown>) {
        params = args;
        return { data: [], error: null };
      },
    };

    await fetchStorageUsage(client, 'org-42');

    expect(params).toEqual({ p_organization_id: 'org-42' });
  });

  it('demande toutes les organisations quand aucune n’est précisée', async () => {
    let params: unknown = 'jamais appelé';
    const client = {
      async rpc(_name: string, args?: Record<string, unknown>) {
        params = args;
        return { data: [], error: null };
      },
    };

    await fetchStorageUsage(client);

    expect(params).toEqual({ p_organization_id: null });
  });

  it('rend une liste vide si l’appel lève au lieu de renvoyer une erreur', async () => {
    // La RPC absente (migration pas encore appliquée) ne doit pas faire tomber
    // l'écran entier en 500.
    const client = {
      rpc() {
        throw new Error('function does not exist');
      },
    };

    await expect(fetchStorageUsage(client as never)).resolves.toEqual([]);
  });
});
