import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const state = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  visible: true, blocked: false, direct: true, conflict: false, fail: false,
  proposal: {} as Record<string, unknown>,
  saved: null as Record<string, unknown> | null,
  filters: [] as [string, unknown][],
}));

vi.mock('@/lib/auth/org-context', () => ({
  resolveOrgContext: async () => ({ organizationId: 'org-a' }), SECTEUR_FORBIDDEN_MESSAGE: 'Secteur interdit',
}));
vi.mock('@/lib/propositions/visibility', () => ({
  propositionSecteurBlocked: async () => state.blocked,
  scopePropositionsQuery: (query: { eq: (key: string, value: unknown) => unknown }) => query.eq('organization_id', 'org-a'),
}));
vi.mock('@/lib/supabase/server', () => {
  const from = (table: string) => {
    let update: Record<string, unknown> | null = null;
    const result = () => {
      if (table === 'organizations') return { data: { preferences: {} } };
      if (table === 'proposition_templates') return { data: { file_config: { sp_config_mode_direct: { actif: state.direct } } } };
      if (update) {
        if (state.fail) return { data: null, error: { message: 'Database unavailable' } };
        if (state.conflict) return { data: null, error: null };
        state.saved = update;
        return { data: { id: 'proposal-a' }, error: null };
      }
      return { data: state.visible ? state.proposal : null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query; },
      is: (key: string, value: unknown) => { state.filters.push([key, value]); return query; },
      update: (value: Record<string, unknown>) => { update = value; return query; },
      single: async () => result(), maybeSingle: async () => result(),
    };
    return query;
  };
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) }, from }),
    createServiceClient: () => ({ from }),
  };
});

beforeEach(() => {
  state.user = { id: 'user-a' }; state.visible = true; state.blocked = false;
  state.direct = true; state.conflict = false; state.fail = false;
  state.saved = null; state.filters = [];
  state.proposal = { id: 'proposal-a', template_id: 'template-a', filled_data: null, statut: 'ready',
    created_at: '2026-11-17T10:00:00Z',
    extracted_data: { _sa_confirmation_required: true, _structured_sa: { private: true },
      situation_actuelle: { abonnements: [{ libelle: 'Fibre', tarif_net_mensuel: 100, quantite: 1 }] } },
  };
});
const request = (operations: unknown = []) => POST(new NextRequest('https://app.test/api/propositions/proposal-a/confirm-sa', {
  method: 'POST', body: JSON.stringify({ operations }),
}), { params: Promise.resolve({ id: 'proposal-a' }) });

describe('confirm direct SA API', () => {
  it('recalculates from stored data, saves an immutable confirmation and hides internal evidence', async () => {
    const response = await request([{ kind: 'update', id: 'abonnements:0', patch: { montant: 40, quantite: 2 } }]);
    expect(response.status).toBe(200);
    expect(state.saved).toMatchObject({ current_step: 4, filled_data: {
      _structured_sa: { private: true },
      _sa_confirmation: { confirmed_by: 'user-a' }, situation_actuelle: { total_ht_mensuel_client: 80 },
    } });
    const result = await response.json();
    expect(result.donnees_extraites._structured_sa).toBeUndefined();
    expect(result.donnees_extraites._sa_confirmation.confirmed_at).toBeTruthy();
    expect(state.filters).toContainEqual(['organization_id', 'org-a']);
    expect(state.filters).toContainEqual(['filled_data->_sa_confirmation', null]);
  });
  it('never puts whole JSON documents in the filters (URI too long) and guards on the extraction revision', async () => {
    (state.proposal.extracted_data as Record<string, unknown>)._sa_edit_context = { revision: 'rev-1' };
    const response = await POST(new NextRequest('https://app.test/api/propositions/proposal-a/confirm-sa', {
      method: 'POST', body: JSON.stringify({ operations: [], revision: 'rev-1' }),
    }), { params: Promise.resolve({ id: 'proposal-a' }) });
    expect(response.status).toBe(200);
    expect(state.filters).toContainEqual(['extracted_data->_sa_edit_context->>revision', 'rev-1']);
    for (const [, value] of state.filters) expect(String(value).length).toBeLessThan(200);
  });
  it('refuses a second confirmation', async () => {
    state.proposal.filled_data = { _sa_confirmation: { confirmed_at: '2026-11-17T10:00:00Z' } };
    expect((await request()).status).toBe(409);
    expect(state.saved).toBeNull();
  });
  it('refuses editing an already prepared SP', async () => {
    state.proposal.suggestions_sp_completes = {};
    expect((await request()).status).toBe(409);
  });
  it('requires a completed extraction', async () => {
    state.proposal.extracted_data = null;
    expect((await request()).status).toBe(409);
  });
  it('refuses confirmation while a new extraction is processing', async () => {
    state.proposal.statut = 'processing';
    expect((await request()).status).toBe(409);
    expect(state.saved).toBeNull();
  });
  it('keeps the questionnaire workflow separate', async () => {
    state.direct = false;
    expect((await request()).status).toBe(400);
  });
  it('refuses concurrent overwrites', async () => {
    state.conflict = true;
    expect((await request()).status).toBe(409);
    expect(state.saved).toBeNull();
  });
  it('rejects edits based on an obsolete extraction', async () => {
    state.proposal.extracted_data = { ...(state.proposal.extracted_data as Record<string, unknown>), _sa_edit_context: { revision: 'new-extraction' } };
    expect((await request()).status).toBe(409);
    expect(state.saved).toBeNull();
  });
  it('does not report success when persistence fails', async () => {
    state.fail = true;
    expect((await request()).status).toBe(500);
  });
  it('rejects malformed edits', async () => {
    expect((await request([{ kind: 'update', id: 'abonnements:0', patch: { montant: -10 } }])).status).toBe(400);
  });
  it('requires authentication and proposal access', async () => {
    state.user = null;
    expect((await request()).status).toBe(401);
    state.user = { id: 'user-a' }; state.blocked = true;
    expect((await request()).status).toBe(403);
    state.blocked = false; state.visible = false;
    expect((await request()).status).toBe(404);
  });
});
