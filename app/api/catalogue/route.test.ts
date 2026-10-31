import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const state = vi.hoisted(() => ({
  secteur: 'mixte',
  queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}));

vi.mock('@/lib/auth/org-context', () => ({
  resolveOrgContext: async () => ({ organizationId: 'org-a', role: 'owner', permissions: { manage_catalogue: true } }),
}));

vi.mock('@/lib/supabase/server', () => {
  function from(table: string) {
    const filters: Record<string, unknown> = {};
    const data = () => {
      state.queries.push({ table, filters: { ...filters } });
      if (table === 'organizations') return { data: { secteur: state.secteur }, error: null };
      if (table === 'proposition_templates') {
        return { data: filters.id === 'tpl-b' && filters.organization_id === 'org-a' ? { secteur: 'bureautique' } : null, error: null };
      }
      return { data: [{ id: filters.secteur_catalogue === 'bureautique' ? 'copieur' : 'telephone' }], error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      order: () => query,
      single: async () => data(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(data()).then(resolve),
    };
    return query;
  }
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'member-a' } } }) }, from }),
    createServiceClient: () => ({ from }),
  };
});

beforeEach(() => {
  state.secteur = 'mixte';
  state.queries.length = 0;
});

function request(query = '') {
  return GET(new NextRequest(`https://app.test/api/catalogue${query}`));
}

describe('catalogue par activité', () => {
  it('garde les produits téléphoniques lors du passage à mixte', async () => {
    expect((await (await request()).json()).produits).toEqual([{ id: 'telephone' }]);
    expect(state.queries.at(-1)?.filters).toMatchObject({ organization_id: 'org-a', secteur_catalogue: 'telephonie' });
  });

  it('utilise le secteur du template pour les questions SP', async () => {
    expect((await (await request('?template_id=tpl-b')).json()).produits).toEqual([{ id: 'copieur' }]);
    expect(state.queries.at(-1)?.filters).toMatchObject({ organization_id: 'org-a', secteur_catalogue: 'bureautique' });
  });

  it('rejette un template d’une autre organisation et les secteurs interdits', async () => {
    expect((await request('?template_id=tpl-other')).status).toBe(400);
    state.secteur = 'telephonie';
    expect((await request('?secteur=bureautique')).status).toBe(400);
    expect(state.queries.some((query) => query.table === 'catalogues_produits')).toBe(false);
  });
});
