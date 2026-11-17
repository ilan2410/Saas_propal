import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const variantId = '00000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  role: 'commercial', download: true, all: false, sectorBlocked: false, signDenied: false,
  tables: {} as Record<string, Record<string, unknown>[]>,
  signed: vi.fn(), storage: vi.fn(), fetch: vi.fn(),
  propositionColumns: new Set<string>(), databaseError: false,
}));

vi.mock('@/lib/auth/org-context', () => ({
  resolveOrgContext: async () => ({ organizationId: 'org-a', memberUserId: 'user-a', role: state.role,
    permissions: { download_proposition: state.download, view_all_propositions: state.all } }),
  SECTEUR_FORBIDDEN_MESSAGE: 'Secteur interdit',
}));
vi.mock('@/lib/propositions/visibility', async original => ({
  ...await original<typeof import('@/lib/propositions/visibility')>(),
  propositionSecteurBlocked: async () => state.sectorBlocked,
}));
vi.mock('@/lib/supabase/server', () => {
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let projection = '*';
    const query = {
      select: (columns = '*') => { projection = columns; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      maybeSingle: async () => {
        // PostgreSQL rejects the entire SELECT if even one column does not exist.
        // Validate against the repository's actual schema, not the fixture's keys.
        if (table === 'propositions') {
          const unknownColumn = projection !== '*' && projection.split(',').some(column => !state.propositionColumns.has(column.trim()));
          if (unknownColumn || state.databaseError) return { data: null, error: { code: unknownColumn ? '42703' : '08006', message: 'Internal database error' } };
        }
        return { data: state.tables[table]?.find(row => filters.every(([key, value]) => row[key] === value)) ?? null, error: null };
      },
    };
    return query;
  };
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) }, from,
      storage: { from: (bucket: string) => {
        state.storage(bucket);
        return { createSignedUrl: async (key: string, seconds: number) => {
          state.signed(key, seconds);
          return state.signDenied ? { data: null, error: { message: 'Denied private storage token' } }
            : { data: { signedUrl: 'https://storage.test/storage/v1/object/sign/' + bucket + '/' + encodeURI(key) + '?token=private-token' }, error: null };
        } };
      } },
    }), createServiceClient: () => ({ from }),
  };
});

beforeEach(() => {
  const schema = readFileSync(resolve('supabase/schema.sql'), 'utf8');
  const table = schema.match(/CREATE TABLE IF NOT EXISTS propositions \(([\s\S]*?)\r?\n\);/)?.[1];
  if (!table) throw new Error('Missing propositions schema fixture');
  state.propositionColumns = new Set([...table.matchAll(/^  ([a-z_]\w*)\s+/gm)].map(match => match[1]));
  const annexMigration = readFileSync(resolve('supabase/migrations/2026-11-09_sub_templates.sql'), 'utf8');
  for (const match of annexMigration.matchAll(/ALTER TABLE public\.propositions ADD COLUMN (\w+)/g)) state.propositionColumns.add(match[1]);
  state.databaseError = false;
  state.user = { id: 'user-a' }; state.role = 'commercial'; state.download = true;
  state.all = false; state.sectorBlocked = false; state.signDenied = false;
  state.signed.mockClear(); state.storage.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.test');
  vi.stubGlobal('fetch', state.fetch.mockReset().mockImplementation(async () => new Response(new Uint8Array([80, 75, 3, 4]), {
    headers: { 'content-type': 'application/octet-stream' },
  })));
  state.tables = {
    propositions: [{ id: 'proposal-a', organization_id: 'org-a', created_by: 'user-a', template_id: 'template-a',
      duplicated_template_url: 'https://storage.test/storage/v1/object/public/templates/generated/org-a/Proposition%20%C3%A9t%C3%A9.docx',
      selected_sub_template_ids: ['annex-a'] }],
    proposition_templates: [{ id: 'template-a', organization_id: 'org-a', file_config: {} }],
    template_sub_templates: [{ id: 'annex-a', template_id: 'template-a', organization_id: 'org-a' }],
    proposition_sub_template_results: [{ proposition_id: 'proposal-a', sub_template_id: 'annex-a', organization_id: 'org-a',
      status: 'success', file_url: 'https://storage.test/storage/v1/object/public/templates/generated/org-a/annexe.xlsx' }],
    proposition_sp_variants: [{ id: variantId, proposition_id: 'proposal-a', organization_id: 'org-a', selected_sub_template_ids: ['annex-a'],
      duplicated_template_url: 'https://storage.test/storage/v1/object/public/templates/generated/org-a/variante.docx' }],
    proposition_sp_variant_results: [{ variant_id: variantId, sub_template_id: 'annex-a', organization_id: 'org-a',
      status: 'success', file_url: 'https://storage.test/storage/v1/object/public/templates/generated/org-a/variante-annexe.xlsx' }],
  };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (query = '') => GET(new NextRequest('https://app.test/api/propositions/proposal-a/download' + query), { params: Promise.resolve({ id: 'proposal-a' }) });

describe('authenticated document downloads', () => {
  it('downloads using the real schema even though the legacy fichier_genere_url column is absent', async () => {
    expect(state.propositionColumns.has('fichier_genere_url')).toBe(false);
    expect(state.propositionColumns.has('duplicated_template_url')).toBe(true);
    expect((await request()).status).toBe(200);
    expect(state.fetch).toHaveBeenCalledOnce();
  });
  it('distinguishes a database failure from a missing or inaccessible proposal', async () => {
    state.databaseError = true;
    const response = await request();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('Proposition introuvable');
    expect(text).not.toContain('Internal database error');
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('streams identical bytes as an attachment without redirecting or revealing the storage URL', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([80, 75, 3, 4]);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''Proposition%20%C3%A9t%C3%A9.docx");
    expect(response.headers.get('content-type')).toContain('wordprocessingml.document');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(state.signed).toHaveBeenCalledWith('generated/org-a/Proposition été.docx', 60);
    expect(state.fetch).toHaveBeenCalledWith(expect.stringContaining('https://storage.test/storage/v1/object/sign/'), expect.objectContaining({ redirect: 'error', cache: 'no-store' }));
  });
  it.each(['unauthenticated', 'permission', 'organization', 'creator', 'sector'])('refuses %s access before touching storage', async mode => {
    if (mode === 'unauthenticated') state.user = null;
    if (mode === 'permission') state.download = false;
    if (mode === 'organization') state.tables.propositions[0].organization_id = 'org-b';
    if (mode === 'creator') state.tables.propositions[0].created_by = 'other-user';
    if (mode === 'sector') state.sectorBlocked = true;
    expect((await request()).status).toBe(mode === 'unauthenticated' ? 401 : ['permission', 'sector'].includes(mode) ? 403 : 404);
    expect(state.signed).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('preserves owner access', async () => {
    state.role = 'owner'; state.download = false; state.tables.propositions[0].created_by = 'other-user';
    expect((await request()).status).toBe(200);
  });
  it.each(['https://evil.test/file.docx', 'https://storage.test/storage/v1/object/public/templates/generated/org-b/file.docx',
    'https://storage.test/storage/v1/object/public/documents/org-a/file.docx',
    'https://storage.test/storage/v1/object/public/templates/generated/org-a/%252e%252e/file.docx'])('rejects an invalid stored object %s', async url => {
    state.tables.propositions[0].duplicated_template_url = url;
    expect((await request()).status).toBe(403);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('ignores a caller supplied URL and downloads only the authorized stored object', async () => {
    expect((await request('?url=https://evil.test/private')).status).toBe(200);
    expect(state.fetch.mock.calls[0][0]).not.toContain('evil.test');
  });
  it('keeps the user Storage RLS check and hides provider errors and tokens', async () => {
    state.signDenied = true;
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/token|storage.test|Denied/);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each(['?variant=missing', '?variant='])('does not fall back to the parent for an invalid variant %s', async query => {
    expect((await request(query)).status).toBe(404);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('isolates a variant main file and its annex from the parent', async () => {
    expect((await request('?variant=' + variantId)).status).toBe(200);
    expect(state.signed).toHaveBeenLastCalledWith('generated/org-a/variante.docx', 60);
    expect((await request('?variant=' + variantId + '&annex=annex-a')).status).toBe(200);
    expect(state.signed).toHaveBeenLastCalledWith('generated/org-a/variante-annexe.xlsx', 60);
  });
  it.each(['organization_id', 'proposition_id'])('rejects a variant with the wrong %s', async key => {
    state.tables.proposition_sp_variants[0][key] = 'other';
    expect((await request('?variant=' + variantId)).status).toBe(404);
  });
  it('serves the selected Excel annex with its original type and filename', async () => {
    const response = await request('?annex=annex-a');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect(response.headers.get('content-disposition')).toContain('annexe.xlsx');
  });
  it.each(['unselected', 'wrong-template', 'wrong-proposal', 'wrong-org', 'disabled', 'failed'])('rejects a %s annex', async mode => {
    if (mode === 'unselected') state.tables.propositions[0].selected_sub_template_ids = [];
    if (mode === 'wrong-template') state.tables.template_sub_templates[0].template_id = 'other';
    if (mode === 'wrong-proposal') state.tables.proposition_sub_template_results[0].proposition_id = 'other';
    if (mode === 'wrong-org') state.tables.proposition_sub_template_results[0].organization_id = 'other';
    if (mode === 'disabled') state.tables.proposition_templates[0].file_config = { sub_templates_enabled: false };
    if (mode === 'failed') state.tables.proposition_sub_template_results[0].status = 'error';
    expect((await request('?annex=annex-a')).status).toBe(404);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('handles missing files and provider failures without returning a partial document', async () => {
    state.fetch.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    expect((await request()).status).toBe(404);
    state.fetch.mockRejectedValueOnce(new Error('https://storage.test/?token=secret'));
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret');
  });
});
