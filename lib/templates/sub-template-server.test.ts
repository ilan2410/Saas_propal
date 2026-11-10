/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory storage/database adapter. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { duplicateSubTemplates, removeSubTemplateFiles, subTemplateFiles } from './sub-template-server';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, copy: vi.fn(), remove: vi.fn() }));
class Query {
 filters: ((r: any) => boolean)[] = []; action = 'read'; values: any;
 constructor(public table: string) {}
 select() { return this; } eq(k: string,v: unknown) { this.filters.push(r => r[k] === v); return this; }
 in(k: string,v: unknown[]) { this.filters.push(r => v.includes(r[k])); return this; }
 insert(v: unknown) { this.action = 'insert'; this.values = v; return this; }
 delete() { this.action = 'delete'; return this; }
 then(resolve: (v: any) => unknown) {
  const table = state.tables[this.table] ?? (state.tables[this.table] = []);
  const matches = table.filter(r => this.filters.every(f => f(r)));
  if (this.action === 'insert') table.push({ id: crypto.randomUUID(), ...this.values });
  if (this.action === 'delete') state.tables[this.table] = table.filter(r => !matches.includes(r));
  return Promise.resolve({ data: matches, error: null }).then(resolve);
 }
}
const sourceUrl = (key: string) => 'https://storage.test/storage/v1/object/public/templates/' + key;
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: (table: string) => new Query(table), storage: { from: () => ({ copy: state.copy, remove: state.remove, getPublicUrl: (path: string) => ({ data: { publicUrl: sourceUrl(path) } }) }) } }) }));
beforeEach(() => {
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://storage.test');
 state.copy.mockReset().mockResolvedValue({ error: null }); state.remove.mockReset().mockResolvedValue({ error: null });
 state.tables = { template_sub_templates: ['a','b'].map(id => ({ id, template_id: 'source', organization_id: 'org', nom: id, file_type: id === 'a' ? 'word' : 'excel', file_url: sourceUrl('org/' + id), file_name: id, file_size_mb: 1, file_config: { fieldTypes: { code: 'text' } } })), proposition_sub_template_results: [] };
});
afterEach(() => vi.unstubAllEnvs());
describe('annex storage lifecycle', () => {
 it('duplicates source documents into independent storage objects with their own mappings', async () => {
  await duplicateSubTemplates('source','target','org');
  const copies = state.tables.template_sub_templates.filter(r => r.template_id === 'target'); expect(copies).toHaveLength(2); expect(state.copy).toHaveBeenCalledTimes(2);
  expect(copies[0].file_url).not.toBe(state.tables.template_sub_templates[0].file_url); expect(copies[0].file_config).toEqual({ fieldTypes: { code: 'text' } });
  expect(state.copy.mock.calls[0][1]).toMatch(/^org\/sub-templates\/[0-9a-f-]+\.docx$/);
  expect(state.copy.mock.calls[1][1]).toMatch(/\.xlsx$/);
 });
 it('rolls back copied annex rows and files if a later file cannot be copied', async () => {
  state.copy.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('Copy failed') });
  await expect(duplicateSubTemplates('source','target','org')).rejects.toThrow('Copy failed');
  expect(state.tables.template_sub_templates.filter(r => r.template_id === 'target')).toEqual([]); expect(state.remove).toHaveBeenCalledOnce(); expect(state.remove.mock.calls[0][0]).toHaveLength(1);
 });
 it('collects source and generated files only for the requested parent and organization', async () => {
  state.tables.proposition_sub_template_results.push({ sub_template_id: 'a', organization_id: 'org', file_url: sourceUrl('generated/org/result') }, { sub_template_id: 'a', organization_id: 'other', file_url: sourceUrl('generated/other/result') });
  expect(await subTemplateFiles('source','org')).toEqual([sourceUrl('org/a'),sourceUrl('org/b'),sourceUrl('generated/org/result')]);
 });
 it('never deletes foreign-tenant URLs and deduplicates file paths', async () => {
  await removeSubTemplateFiles([sourceUrl('org/a'),sourceUrl('org/a'),sourceUrl('other/a'), 'https://evil.test/org/a',null], 'org');
  expect(state.remove).toHaveBeenCalledWith(['org/a']);
 });
});
