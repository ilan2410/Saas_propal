import { describe, expect, it } from 'vitest';
import { fetchStorageUsage, groupStorageUsage, type StorageUsageRpcRow } from './storage-usage';

describe('groupStorageUsage', () => {
  it('regroupe les buckets par organisation et totalise', () => {
    const rows: StorageUsageRpcRow[] = [
      { organization_id: 'org-1', bucket_id: 'documents', bytes: 1000, objects: 2 },
      { organization_id: 'org-1', bucket_id: 'proposition-attachments', bytes: 500, objects: 1 },
      { organization_id: 'org-2', bucket_id: 'documents', bytes: 200, objects: 1 },
    ];

    const result = groupStorageUsage(rows);

    expect(result).toHaveLength(2);
    expect(result[0].organizationId).toBe('org-1');
    expect(result[0].totalBytes).toBe(1500);
    expect(result[0].totalObjects).toBe(3);
    expect(result[0].buckets).toHaveLength(2);
  });

  it('trie du plus gros au plus petit', () => {
    const result = groupStorageUsage([
      { organization_id: 'petit', bucket_id: 'documents', bytes: 10, objects: 1 },
      { organization_id: 'gros', bucket_id: 'documents', bytes: 10_000, objects: 1 },
    ]);

    expect(result.map((item) => item.organizationId)).toEqual(['gros', 'petit']);
  });

  it('conserve les fichiers non attribués sous organizationId null', () => {
    const result = groupStorageUsage([
      { organization_id: null, bucket_id: 'propositions', bytes: 4242, objects: 7 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBeNull();
    expect(result[0].totalBytes).toBe(4242);
  });

  it('traite une taille absente comme zéro', () => {
    const result = groupStorageUsage([
      { organization_id: 'org-1', bucket_id: 'documents', bytes: null, objects: 1 },
    ] as unknown as StorageUsageRpcRow[]);

    expect(result[0].totalBytes).toBe(0);
    expect(result[0].totalObjects).toBe(1);
  });
});

describe('fetchStorageUsage', () => {
  it('appelle la fonction SQL et regroupe le résultat', async () => {
    const appels: string[] = [];
    const client = {
      async rpc(name: string) {
        appels.push(name);
        return {
          data: [{ organization_id: 'org-1', bucket_id: 'documents', bytes: 10, objects: 1 }],
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
});

describe('fetchStorageUsage — filtre par organisation', () => {
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
