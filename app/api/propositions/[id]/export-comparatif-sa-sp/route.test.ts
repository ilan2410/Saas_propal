import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { GET } from './route';
import { POST as exportSuggestions } from '../export-comparatif/route';

const state = vi.hoisted(() => ({
  user: { id: 'member-a' } as { id: string } | null,
  role: 'commercial', download: true, viewAll: false,
  orgError: false,
  proposal: { id: 'proposal-a', organization_id: 'org-a', created_by: 'member-a',
    nom_client: 'Client Test', template_id: 'template-a', extracted_data: {}, filled_data: {},
    sp_reponses: [], suggestions_sp_completes: null } as Record<string, unknown>,
  serviceReads: vi.fn(), filters: vi.fn(),
}));

vi.mock('@/lib/auth/org-context', () => ({
  resolveOrgContext: async () => ({ organizationId: 'org-a', role: state.role,
    memberUserId: state.user?.id,
    permissions: { download_comparatif_sa_sp: state.download, view_all_propositions: state.viewAll } }),
}));

vi.mock('@/lib/supabase/server', () => {
  function from(table: string, service = false) {
    let projection = '';
    const filters: Record<string, unknown> = {};
    if (service) state.serviceReads(table);
    const result = () => {
      // Reproduce the migration's revoked organization preferences SELECT grant.
      if (!service && (table === 'organizations' || projection.includes('organizations(') || projection.includes('organizations ('))) {
        return { data: null, error: { code: '42501', message: 'permission denied for table organizations' } };
      }
      if (service) {
        if (table !== 'organizations' || filters.id !== 'org-a') throw new Error('Unscoped privileged read');
        return state.orgError ? { data: null, error: { code: 'failure' } } : {
          data: { nom: 'Organisation Test', preferences: { sp_customization: { company_name: 'Export Company' } }, sp_questions: [] }, error: null,
        };
      }
      if (table === 'propositions') {
        const visible = Object.entries(filters).every(([key, value]) => state.proposal[key] === value);
        return { data: visible ? state.proposal : null, error: visible ? null : { code: 'PGRST116' } };
      }
      return { data: table === 'proposition_templates' ? { file_config: {} } : [], error: null };
    };
    const query = {
      select: (columns: string) => { projection = columns; return query; },
      eq: (column: string, value: unknown) => { filters[column] = value; state.filters(table, column, value); return query; },
      or: () => query,
      single: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  }
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) }, from: (table: string) => from(table) }),
    createServiceClient: () => ({ from: (table: string) => from(table, true) }),
  };
});

// The related suggestions export has the same organization preferences dependency.
vi.mock('@/lib/pdf/comparatif-generator', () => ({ generateComparatifPdf: async () => Buffer.from('%PDF-test') }));
vi.mock('@/lib/word/comparatif-generator', () => ({ generateComparatifWord: async () => Buffer.from('suggestions-word') }));

beforeEach(() => {
  state.user = { id: 'member-a' }; state.role = 'commercial';
  state.download = true; state.viewAll = false; state.orgError = false;
  state.proposal.organization_id = 'org-a'; state.proposal.created_by = 'member-a';
  state.serviceReads.mockClear(); state.filters.mockClear();
});

function request(format: string, id = 'proposal-a') {
  return GET(new NextRequest(`https://app.test/api/propositions/${id}/export-comparatif-sa-sp?format=${format}`), { params: Promise.resolve({ id }) });
}

describe('SA/SP exports after private organization column migration', () => {
  it.each(['owner', 'commercial'])('generates a real Word document for an authorized %s', async (role) => {
    state.role = role;
    const response = await request('word');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('comparatif-sa-sp-Client_Test.doc');
    expect(await response.text()).toContain('Export Company');
    expect(state.filters).toHaveBeenCalledWith('organizations', 'id', 'org-a');
  });
  it.each(['owner', 'commercial'])('generates a valid Excel workbook for an authorized %s', async (role) => {
    state.role = role;
    const response = await request('excel');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });
  it('rejects a foreign organization before reading private settings', async () => {
    state.proposal.organization_id = 'org-b';
    expect((await request('word')).status).toBe(404);
    expect(state.serviceReads).not.toHaveBeenCalled();
  });
  it('rejects a colleague proposal without view-all permission', async () => {
    state.proposal.created_by = 'colleague-a';
    expect((await request('excel')).status).toBe(404);
    expect(state.serviceReads).not.toHaveBeenCalled();
  });
  it('allows a colleague proposal with view-all permission', async () => {
    state.proposal.created_by = 'colleague-a'; state.viewAll = true;
    expect((await request('word')).status).toBe(200);
  });
  it.each(['word', 'excel'])('enforces the download permission for %s', async (format) => {
    state.download = false;
    expect((await request(format)).status).toBe(403);
    expect(state.serviceReads).not.toHaveBeenCalled();
    expect(state.filters).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated downloads', async () => {
    state.user = null;
    expect((await request('word')).status).toBe(401);
    expect(state.serviceReads).not.toHaveBeenCalled();
  });
  it('does not misreport configuration failures as a missing proposal', async () => {
    state.orgError = true;
    expect((await request('word')).status).toBe(500);
  });
  it('also keeps the suggestions export working with private preferences', async () => {
    const response = await exportSuggestions(new NextRequest('https://app.test/api/propositions/proposal-a/export-comparatif', {
      method: 'POST', body: JSON.stringify({ suggestions: [], synthese: {} }),
    }), { params: Promise.resolve({ id: 'proposal-a' }) });
    expect(response.status).toBe(200);
    expect(state.filters).toHaveBeenCalledWith('organizations', 'id', 'org-a');
  });
});
