import { describe, expect, it } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { resolveOrgContext } from './org-context';

// Mock minimal d'un client Supabase : chaque `.from(table)` renvoie un builder
// chaînable dont `.maybeSingle()` / `.single()` résout la valeur configurée.
function makeSupabase(tables: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      const result = table in tables ? tables[table] : null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: result ?? null, error: null }),
        single: () => Promise.resolve({ data: result ?? null, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const user = { id: 'user-1' } as User;

function commercialMember(overrides: {
  permissions_override?: Record<string, boolean> | null;
  commercial_default_permissions?: Record<string, boolean>;
}) {
  return {
    id: 'member-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    actif: true,
    prenom: 'Alex',
    nom: 'Martin',
    telephone_fixe: '',
    telephone_mobile: '',
    permissions_override: overrides.permissions_override ?? null,
    organizations: {
      commercial_default_permissions: overrides.commercial_default_permissions ?? {},
    },
  };
}

describe('resolveOrgContext — permissions de téléchargement', () => {
  it('accorde download_proposition et download_comparatif_sa_sp par défaut à un commercial sans override ni défaut org', async () => {
    const supabase = makeSupabase({
      organizations: null,
      organization_members: commercialMember({}),
    });

    const ctx = await resolveOrgContext(supabase, user);

    expect(ctx?.role).toBe('commercial');
    expect(ctx?.permissions.download_proposition).toBe(true);
    expect(ctx?.permissions.download_comparatif_sa_sp).toBe(true);
    // Les permissions historiques restent désactivées par défaut.
    expect(ctx?.permissions.view_all_propositions).toBe(false);
    expect(ctx?.permissions.manage_catalogue).toBe(false);
  });

  it('respecte un override membre explicite à false', async () => {
    const supabase = makeSupabase({
      organizations: null,
      organization_members: commercialMember({
        permissions_override: { download_proposition: false },
      }),
    });

    const ctx = await resolveOrgContext(supabase, user);

    expect(ctx?.permissions.download_proposition).toBe(false);
    expect(ctx?.permissions.download_comparatif_sa_sp).toBe(true);
  });

  it('respecte un défaut org à false quand il n’y a pas d’override', async () => {
    const supabase = makeSupabase({
      organizations: null,
      organization_members: commercialMember({
        commercial_default_permissions: { download_comparatif_sa_sp: false },
      }),
    });

    const ctx = await resolveOrgContext(supabase, user);

    expect(ctx?.permissions.download_comparatif_sa_sp).toBe(false);
    expect(ctx?.permissions.download_proposition).toBe(true);
  });

  it('donne toutes les permissions (dont les nouvelles) à un propriétaire', async () => {
    const supabase = makeSupabase({
      organizations: {
        id: 'user-1',
        contact_prenom: 'Owner',
        contact_nom: 'Boss',
        telephone_fixe: '',
        telephone_mobile: '',
      },
    });

    const ctx = await resolveOrgContext(supabase, user);

    expect(ctx?.role).toBe('owner');
    expect(ctx?.permissions.download_proposition).toBe(true);
    expect(ctx?.permissions.download_comparatif_sa_sp).toBe(true);
  });
});
