/* eslint-disable @typescript-eslint/no-explicit-any -- Small in-memory Supabase query harness. */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import { previewTemplateDocument } from '@/lib/templates/sub-template-preview';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgContext } from '@/lib/auth/org-context';
import { GET as listAnnexes, POST as createAnnex, PUT as updateAnnex, DELETE as deleteAnnex, PATCH as preference } from '@/app/api/templates/[id]/sub-templates/route';
const state = vi.hoisted(() => ({ user: 'user-a' as string | null, blocked: false, manage: true, download: true, fail: '', tables: {} as Record<string, Record<string, any>[]>, generate: vi.fn(), remove: vi.fn(), word: vi.fn(), excel: vi.fn() }));
class Query {
 filters: ((row: Record<string, any>) => boolean)[] = []; action = 'read'; values: any; one = false;
 constructor(public table: string) {}
 sorts: { key: string; ascending: boolean }[] = []; max = Infinity;
 select() { return this; } order(key: string, options?: { ascending?: boolean }) { this.sorts.push({ key, ascending: options?.ascending ?? true }); return this; }
 limit(value: number) { this.max = value; return this; }
 not(key: string, _op: string, value: unknown) { this.filters.push(r => value === null ? r[key] != null : r[key] !== value); return this; }
 eq(key: string, value: unknown) { this.filters.push(r => r[key] === value); return this; }
 in(key: string, values: unknown[]) { this.filters.push(r => values.includes(r[key])); return this; }
 update(value: any) { this.action = 'update'; this.values = value; return this; }
 insert(value: any) { this.action = 'insert'; this.values = value; return this; }
 upsert(value: any) { this.action = 'upsert'; this.values = value; return this; }
 delete() { this.action = 'delete'; return this; }
 single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
 then(resolve: (v: any) => unknown) {
  const table = state.tables[this.table] ?? (state.tables[this.table] = []);
  let rows = table.filter(r => this.filters.every(f => f(r)));
  for (const sort of [...this.sorts].reverse()) rows.sort((a,b) => String(a[sort.key]).localeCompare(String(b[sort.key])) * (sort.ascending ? 1 : -1));
  rows = rows.slice(0, this.max);
  if (this.action === 'update') rows.forEach(r => Object.assign(r, this.values));
  if (this.action === 'delete') state.tables[this.table] = table.filter(r => !rows.includes(r));
  if (this.action === 'insert') { const value = { id: 'created', ...this.values }; table.push(value); rows = [value]; }
  if (this.action === 'upsert') {
   const keys = this.table === 'template_generation_preferences' ? ['user_id','template_id'] : ['proposition_id','sub_template_id'];
   const existing = table.find(r => keys.every(k => r[k] === this.values[k]));
   if (existing) Object.assign(existing, this.values); else table.push({ ...this.values });
   rows = [existing ?? this.values];
  }
  return Promise.resolve({ data: this.one ? rows[0] ?? null : rows.map(r => ({ ...r })), error: null }).then(resolve);
 }
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) }, from: (table: string) => new Query(table) });
const context = () => ({ organizationId: 'org-a', role: 'commercial', permissions: { manage_templates: state.manage, download_proposition: state.download }, secteur: null });
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client(), createServiceClient: () => client() }));
vi.mock('@/lib/auth/org-context', () => ({ resolveOrgContext: async () => context(), allowedSecteurs: () => ['telephonie'], SECTEUR_FORBIDDEN_MESSAGE: 'secteur' }));
vi.mock('@/lib/auth/template-editor-context', () => ({ resolveTemplateEditorContext: async () => ({ client: client(), ctx: context() }) }));
vi.mock('@/lib/propositions/visibility', () => ({ propositionSecteurBlocked: async () => state.blocked, scopePropositionsQuery: (q: Query) => q.eq('organization_id', 'org-a').eq('created_by', state.user) }));
vi.mock('@/lib/security/storage-access', () => ({ signedOrganizationStorageUrl: async (_c: unknown, url: string) => url + '?signed', organizationStoragePath: (url: string, _bucket: string, org: string) => url.includes('/' + org + '/') ? 'safe-path' : null }));
vi.mock('@/lib/templates/sub-template-server', () => ({ removeSubTemplateFiles: (...args: unknown[]) => state.remove(...args) }));
vi.mock('@/lib/generators/prepare-proposition', () => ({ preparePropositionGeneration: async (_c: unknown, _ctx: unknown, proposition: any, template: any) => ({ template, donnees: { ...proposition.extracted_data, ...proposition.filled_data }, organization_id: 'org-a', proposition_id: proposition.id, sp_reference: 'REF' }) }));
vi.mock('@/lib/generators/word-proposition', () => ({ renderWordProposition: (...args: unknown[]) => state.word(...args) }));
vi.mock('@/lib/generators/excel-workbook', () => ({ fillExcelWorkbook: (...args: unknown[]) => state.excel(...args) }));
vi.mock('@/lib/generators', () => ({ generatePropositionFile: (options: any) => state.generate(options) }));
const params = { params: Promise.resolve({ id: 'proposal' }) };
function request(method = 'POST', body?: unknown, url = 'https://app.test/api/propositions/proposal/generate') { return new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }); }
beforeEach(() => {
 state.user = 'user-a'; state.blocked = false; state.manage = true; state.download = true; state.fail = '';
 state.word.mockReset().mockResolvedValue(new Uint8Array([1,2,3])); state.excel.mockReset().mockResolvedValue(new Uint8Array([4,5,6]));
 state.remove.mockReset(); state.generate.mockReset().mockImplementation(async options => { if (options.template.id === state.fail) throw new Error('Mapping invalide'); return 'https://storage.test/org-a/' + options.template.id; });
 state.tables = {
  propositions: [{ id: 'proposal', template_id: 'parent', organization_id: 'org-a', created_by: 'user-a', selected_sub_template_ids: null, extracted_data: { client: 'old' }, filled_data: { client: 'corrected' } }],
  proposition_templates: [{ id: 'parent', organization_id: 'org-a', secteur: 'telephonie', file_type: 'word', file_config: { fieldMappings: { parent: 'x' }, sp_config_loyer: { enabled: true } } }],
  template_sub_templates: ['a','b'].map((id,i) => ({ id, template_id: 'parent', organization_id: 'org-a', nom: 'Annexe ' + id, file_type: i ? 'word' : 'excel', file_url: 'https://storage.test/org-a/' + id, file_name: id + '.xlsx', file_size_mb: 1, file_config: { sheetMappings: [{ sheetName: 'Feuil1', mapping: { client: 'A1' } }] } })),
  template_generation_preferences: [], proposition_sub_template_results: [],
 };
});
describe('proposal annex generation', () => {
 it('generates mixed-format annexes from the same corrected values, without inheriting parent mappings', async () => {
  const response = await POST(request(), params); const result = await response.json();
  expect(response.status).toBe(200); expect(result.file_url).toContain('parent'); expect(result.sub_templates).toHaveLength(2);
  expect(state.generate.mock.calls.map(([o]) => o.template.file_type)).toEqual(['word','excel','word']);
  const child = state.generate.mock.calls[1][0]; expect(child.donnees).toEqual({ client: 'corrected' }); expect(child.template.file_config.fieldMappings).toBeUndefined(); expect(child.template.file_config.sp_config_loyer).toEqual({ enabled: true });
  expect(state.tables.propositions[0].selected_sub_template_ids).toEqual(['a','b']);
 });
 it('keeps successful files and records the failing annex independently', async () => {
  state.fail = 'a'; const response = await POST(request(), params); const result = await response.json();
  expect(response.status).toBe(200); expect(result.sub_templates.map((r: any) => r.status)).toEqual(['error','success']); expect(state.tables.propositions[0].statut).toBe('exported');
  expect(state.tables.proposition_sub_template_results.find(r => r.sub_template_id === 'a')?.error).toBe('Mapping invalide');
 });
 it('retries only the requested annex and preserves the main proposal', async () => {
  state.tables.propositions[0].duplicated_template_url = 'https://storage.test/org-a/existing';
  await POST(request('POST', { target_sub_template_id: 'b' }), params);
  expect(state.generate).toHaveBeenCalledTimes(1); expect(state.generate.mock.calls[0][0].template.id).toBe('b'); expect(state.tables.propositions[0].duplicated_template_url).toContain('existing');
 });
 it('preserves an explicit empty selection in choose mode', async () => {
  state.tables.template_generation_preferences.push({ user_id: 'user-a', template_id: 'parent', mode: 'choose' });
  await POST(request('POST', { selected_sub_template_ids: [] }), params); await POST(request(), params);
  expect(state.generate.mock.calls.map(([o]) => o.template.id)).toEqual(['parent','parent']); expect(state.tables.propositions[0].selected_sub_template_ids).toEqual([]);
 });
 it('rejects foreign annex IDs before rendering', async () => {
  expect((await POST(request('POST', { selected_sub_template_ids: ['foreign'] }), params)).status).toBe(400); expect(state.generate).not.toHaveBeenCalled();
 });
 it.each(['unauthenticated','no-download','sector','other-author'])('blocks %s access', async mode => {
  if (mode === 'unauthenticated') state.user = null; if (mode === 'no-download') state.download = false; if (mode === 'sector') state.blocked = true; if (mode === 'other-author') state.user = 'user-b';
  expect((await POST(request(), params)).status).toBeGreaterThanOrEqual(400); expect(state.generate).not.toHaveBeenCalled();
 });
 it('cleans deselected results while leaving successful selected documents alone', async () => {
  state.tables.proposition_sub_template_results.push({ proposition_id: 'proposal', organization_id: 'org-a', sub_template_id: 'a', file_url: 'https://storage.test/org-a/old' });
  await POST(request('POST', { selected_sub_template_ids: ['b'] }), params);
  expect(state.remove).toHaveBeenCalledWith(['https://storage.test/org-a/old'], 'org-a'); expect(state.tables.proposition_sub_template_results.map(r => r.sub_template_id)).toEqual(['b']);
 });
 it('GET resolves saved selection and excludes annexes belonging to another organization', async () => {
  state.tables.template_sub_templates.push({ id: 'foreign', template_id: 'parent', organization_id: 'org-b' });
  state.tables.template_generation_preferences.push({ user_id: 'user-a', template_id: 'parent', mode: 'choose' }); state.tables.propositions[0].selected_sub_template_ids = ['a'];
  const data = await (await GET(request('GET'), params)).json(); expect(data.selected_sub_template_ids).toEqual(['a']); expect(data.sub_templates).toHaveLength(2);
 });
});
describe('annex management and personal preferences', () => {
 const templateParams = { params: Promise.resolve({ id: 'parent' }) };
 it('keeps preferences personal to the acting user', async () => {
  await preference(request('PATCH', { mode: 'choose' }), templateParams);
  state.user = 'user-b'; const data = await (await listAnnexes(request('GET'), templateParams)).json(); expect(data.mode).toBe('all');
  expect(state.tables.template_generation_preferences).toEqual([{ user_id: 'user-a', template_id: 'parent', mode: 'choose' }]);
 });
 it('persists only document configuration and a trimmed name', async () => {
  const res = await createAnnex(request('POST', { nom: ' Annexe contrat ', file_type: 'word', file_url: 'https://storage.test/org-a/new', file_name: 'new.docx', file_size_mb: 1, file_config: { fieldMappings: { x: 'client' }, prompt_template: 'secret', sp_config_loyer: { invalid: true } } }), templateParams);
  expect(res.status).toBe(200); const child = (await res.json()).sub_template; expect(child.nom).toBe('Annexe contrat'); expect(child.file_config).toEqual({ fieldMappings: { x: 'client' } });
 });
 it('refuses management without permission and foreign storage references', async () => {
  state.manage = false; expect((await deleteAnnex(request('DELETE', { id: 'a' }), templateParams)).status).toBe(403);
  state.manage = true; expect((await createAnnex(request('POST', { nom: 'x', file_type: 'word', file_url: 'https://storage.test/org-b/file', file_name: 'x', file_size_mb: 1 }), templateParams)).status).toBe(400);
 });
 it('deletes source and generated files for an annex', async () => {
  state.tables.proposition_sub_template_results.push({ sub_template_id: 'a', organization_id: 'org-a', file_url: 'generated-a' });
  expect((await deleteAnnex(request('DELETE', { id: 'a' }), templateParams)).status).toBe(200);
  expect(state.remove).toHaveBeenCalledWith(['https://storage.test/org-a/a','generated-a'], 'org-a');
 });
 it('does not allow editing an annex through a different parent', async () => {
  state.tables.template_sub_templates[0].template_id = 'other-parent';
  expect((await updateAnnex(request('PUT', { id: 'a' }), templateParams)).status).toBe(404);
 });
});

describe('shared parent and annex previews', () => {
 function form(id?: string) { const data = new FormData(); data.set('templateId', 'parent'); if (id) data.set('subTemplateId', id); data.set('file', new File(['draft'], 'document.docx')); return data; }
 const preview = (data: FormData, type: 'word' | 'excel' = 'word') => previewTemplateDocument(client() as unknown as SupabaseClient, context() as OrgContext, data, type);
 it('uses the latest parent proposal with SP before a newer SA-only proposal', async () => {
  state.tables.propositions[0].created_at = '2026-11-08'; state.tables.propositions[0].suggestions_sp_completes = { ready: true };
  state.tables.propositions.push({ ...state.tables.propositions[0], id: 'newer-sa', created_at: '2026-11-09', suggestions_sp_completes: null });
  const response = await preview(form('b')); expect(response.status).toBe(200);
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3]);
  expect(state.word.mock.calls[0][1].proposition_id).toBe('proposal'); expect(state.generate).not.toHaveBeenCalled();
 });
 it('supports an unsaved annex and mapping while inheriting the parent business settings', async () => {
  const data = form('new'); data.set('fileConfig', JSON.stringify({ fieldMappings: { society: 'client' }, sp_config_loyer: { changed: true } }));
  expect((await preview(data)).status).toBe(200);
  expect(state.word.mock.calls[0][1].template.file_config).toEqual({ fieldMappings: { society: 'client' }, sp_config_loyer: { enabled: true } });
 });
 it('uses the Excel renderer with the draft mapping on a Word parent', async () => {
  const data = form('a'); data.set('fileConfig', JSON.stringify({ sheetMappings: [{ sheetName: 'Draft', mapping: { client: 'B3' } }] }));
  expect((await preview(data, 'excel')).status).toBe(200);
  expect(state.excel.mock.calls[0][3].sheetMappings[0].sheetName).toBe('Draft'); expect(state.excel.mock.calls[0][1]).toEqual({ client: 'corrected' });
 });
 it('retains the original parent mapping for a parent preview', async () => {
  await preview(form()); expect(state.word.mock.calls[0][1].template.file_config.fieldMappings).toEqual({ parent: 'x' });
 });
 it('returns hasData false when no visible parent proposal exists', async () => {
  state.tables.propositions[0].created_by = 'someone-else';
  expect(await (await preview(form('b'))).json()).toEqual({ hasData: false }); expect(state.word).not.toHaveBeenCalled();
 });
 it('rejects annexes outside the current parent and organization', async () => {
  state.tables.template_sub_templates[1].organization_id = 'org-b'; expect((await preview(form('b'))).status).toBe(404); expect(state.word).not.toHaveBeenCalled();
 });
});

describe('parent annex activation switch', () => {
 it('hides disabled annexes and generates only the parent without losing stored selection or files', async () => {
  state.tables.proposition_templates[0].file_config.sub_templates_enabled = false;
  state.tables.propositions[0].selected_sub_template_ids = ['a'];
  state.tables.proposition_sub_template_results.push({ proposition_id: 'proposal', organization_id: 'org-a', sub_template_id: 'a', file_url: 'existing' });
  const listing = await (await GET(request('GET'), params)).json(); expect(listing.sub_templates).toEqual([]);
  expect((await POST(request(), params)).status).toBe(200);
  expect(state.generate.mock.calls.map(([o]) => o.template.id)).toEqual(['parent']);
  expect(state.tables.propositions[0].selected_sub_template_ids).toEqual(['a']);
  expect(state.tables.proposition_sub_template_results).toHaveLength(1); expect(state.remove).not.toHaveBeenCalled();
 });
 it('persists activation on the parent, retaining its mapping and annexes', async () => {
  const templateParams = { params: Promise.resolve({ id: 'parent' }) };
  expect((await preference(request('PATCH', { enabled: false }), templateParams)).status).toBe(200);
  expect(state.tables.proposition_templates[0].file_config.fieldMappings).toEqual({ parent: 'x' });
  expect(state.tables.template_sub_templates).toHaveLength(2);
  expect((await (await listAnnexes(request('GET'), templateParams)).json()).enabled).toBe(false);
  await preference(request('PATCH', { enabled: true }), templateParams);
  expect((await (await GET(request('GET'), params)).json()).sub_templates).toHaveLength(2);
 });
 it('requires template management permission to change activation', async () => {
  state.manage = false;
  expect((await preference(request('PATCH', { enabled: false }), { params: Promise.resolve({ id: 'parent' }) })).status).toBe(403);
  expect(state.tables.proposition_templates[0].file_config.sub_templates_enabled).toBeUndefined();
 });
});
