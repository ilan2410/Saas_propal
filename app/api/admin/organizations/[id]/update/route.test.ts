import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

const state = vi.hoisted(() => ({ updates: null as Record<string, unknown> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin', app_metadata: { role: 'admin' } } } }) } }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        update: (data: Record<string, unknown>) => { state.updates = data; return query; },
        eq: () => query,
        select: () => query,
        single: async () => ({ data: { id: 'org-a', secteur: 'mixte' }, error: null }),
      };
      return query;
    },
  }),
}));

describe('conversion téléphonie vers mixte', () => {
  it('ne réinitialise pas le prompt, les champs ou le modèle IA lors du changement de secteur', async () => {
    state.updates = null;
    const response = await PATCH(new NextRequest('https://app.test/api/admin/organizations/org-a/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: 'Entreprise', secteur: 'mixte' }),
    }), { params: Promise.resolve({ id: 'org-a' }) });
    expect(response.status).toBe(200);
    expect(state.updates).toMatchObject({ nom: 'Entreprise', secteur: 'mixte' });
    expect(state.updates).not.toHaveProperty('prompt_template');
    expect(state.updates).not.toHaveProperty('champs_defaut');
    expect(state.updates).not.toHaveProperty('claude_model');
    expect(state.updates).not.toHaveProperty('credits');
  });
});
