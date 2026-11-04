import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_CONFIG_LOYER } from '@/lib/sp/calculLoyer';
import { calculateCartSummary } from '@/lib/sp/calculateCart';
import type { SpConfigLoyer } from '@/types';
import { POST } from './route';

const state = vi.hoisted(() => ({ config: {} as SpConfigLoyer }));

vi.mock('@/lib/auth/org-context', () => ({
  resolveOrgContext: async () => ({ organizationId: 'org-a' }),
}));
vi.mock('@/lib/supabase/server', () => {
  const from = () => {
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: { preferences: { sp_config_loyer: state.config } } }),
    };
    return query;
  };
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) }, from }),
    createServiceClient: () => ({ from }),
  };
});

beforeEach(() => {
  state.config = {
    ...DEFAULT_CONFIG_LOYER,
    duree_mois_par_defaut: undefined,
    composantes_base: { marge: false },
    widget_marge: { mode: 'automatique', operandes: ['montant_finance', 'base_loyer'], operateurs: ['-'] },
  };
});

async function generate() {
  return POST(new NextRequest('https://app.test/api/propositions/generer-suggestions', {
    method: 'POST',
    body: JSON.stringify({ catalogue: [], sp_questions_reponses: [{ question_id: 'sp_total_indemnites', valeur: '900' }] }),
  }));
}

describe('génération avec marge automatique', () => {
  it('utilise la durée de secours du panier quand aucune durée n’est configurée', async () => {
    const cart = calculateCartSummary([{ question_id: 'sp_total_indemnites', valeur: '900' }], [], [], {}, state.config);
    expect(cart.margeErreur).toBeNull();
    const response = await generate();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.sp_duree_mois).toBe(cart.dureeMois);
    expect(result.sp_loyer_mensuel.replace(/\s/g, ' ')).toBe('19,00 €');
  });

  it('renvoie la cause précise quand la formule de marge est invalide', async () => {
    state.config.widget_marge!.operandes = [];
    const response = await generate();
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('formule de marge');
  });
});
