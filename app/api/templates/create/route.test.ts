import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const state = vi.hoisted(() => ({
  orgSecteur: 'mixte',
  inserted: null as Record<string, unknown> | null,
  promptAvailable: true,
}));

vi.mock('@/lib/auth/org-context', () => ({
  resolveOrgContext: async () => ({ organizationId: 'org-a', role: 'owner', permissions: { manage_templates: true } }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'org-a' } } }) } }),
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        insert: (data: Record<string, unknown>) => { state.inserted = data; return query; },
        single: async () => ({ data: table === 'organizations' ? { secteur: state.orgSecteur } : state.inserted, error: null }),
        maybeSingle: async () => ({ data: table === 'prompt_defaults' && state.promptAvailable
          ? { prompt_template: `Prompt ${filters.secteur}.\nCHAMPS À EXTRAIRE:\n{liste_champs_actifs}\nDOCUMENT(S):\n{documents}` }
          : null, error: null }),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  state.orgSecteur = 'mixte';
  state.inserted = null;
  state.promptAvailable = true;
});

function create(secteur?: string) {
  return POST(new NextRequest('https://app.test/api/templates/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: 'Modèle', file_type: 'word', champs_actifs: [], ...(secteur && { secteur }) }),
  }));
}

describe('création de templates mixtes', () => {
  it('sélectionne le prompt associé à chaque activité', async () => {
    expect((await create('bureautique')).status).toBe(200);
    expect(state.inserted?.secteur).toBe('bureautique');
    expect(state.inserted?.prompt_template).toContain('Prompt bureautique.');
    expect((await create('telephonie')).status).toBe(200);
    expect(state.inserted?.secteur).toBe('telephonie');
    expect(state.inserted?.prompt_template).toContain('Prompt telephonie.');
    expect(state.inserted?.champs_actifs).toContain('situation_actuelle');
  });

  it('impose la SA même si un client demande seulement des champs hors SA', async () => {
    expect((await create('telephonie')).status).toBe(200);
    expect(state.inserted?.champs_actifs).toEqual(['situation_actuelle']);
    expect((await create('bureautique')).status).toBe(200);
    expect(state.inserted?.champs_actifs).toEqual([]);
  });

  it('utilise le vrai prompt bureautique si le défaut en base est absent', async () => {
    state.promptAvailable = false;
    expect((await create('bureautique')).status).toBe(200);
    expect(state.inserted?.prompt_template).toContain('copieurs, imprimantes multifonctions');
    expect(state.inserted?.prompt_template).toContain('"facturation_clics"');
    expect(state.inserted?.prompt_template).not.toContain('factures téléphonie');
  });

  it('conserve la téléphonie après la conversion de l’organisation à mixte', async () => {
    state.orgSecteur = 'telephonie';
    await create('telephonie');
    const originalPrompt = state.inserted?.prompt_template;
    state.orgSecteur = 'mixte';
    await create('telephonie');
    expect(state.inserted?.prompt_template).toBe(originalPrompt);
  });

  it('impose un secteur en mixte et interdit l’activité non autorisée ailleurs', async () => {
    expect((await create()).status).toBe(400);
    state.orgSecteur = 'telephonie';
    expect((await create('bureautique')).status).toBe(400);
    expect(state.inserted).toBeNull();
  });
});
