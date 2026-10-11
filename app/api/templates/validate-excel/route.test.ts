import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { POST } from './route';

const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } });
const maybeSingle = vi.fn().mockResolvedValue({ data: { file_type: 'excel', file_url: 'https://storage.example.test/template.xlsx' } });
const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, from: () => query }) }));
vi.mock('@/lib/auth/org-context', () => ({ resolveOrgContext: async () => ({ organizationId: 'org-1' }) }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function request(config: Record<string, unknown>, formula = false) {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Offre');
  if (formula) sheet.getCell('A1').value = { formula: '1+1', result: 2 };
  const bytes = await workbook.xlsx.writeBuffer();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes }));
  const form = new FormData(); form.append('templateId', 'template-1'); form.append('fileConfig', JSON.stringify(config));
  return new NextRequest('https://example.test/api/templates/validate-excel', { method: 'POST', body: form });
}

describe('validation du mapping Excel', () => {
  it('vérifie le vrai classeur et filtre le template par organisation', async () => {
    const response = await POST(await request({ sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'A1' } }] }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ valid: true });
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });
  it('renvoie les erreurs de formule avant sauvegarde', async () => {
    const response = await POST(await request({ sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'A1' } }] }, true));
    expect(response.status).toBe(400); expect((await response.json()).error).toContain('formule protégée');
  });
  it('refuse les appels non authentifiés', async () => {
    const req = await request({});
    getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await POST(req)).status).toBe(401);
  });
  it('valide un nouveau fichier uploadé avant la création du template', async () => {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Offre').getCell('A1').value = 'Exemple';
    const bytes = await workbook.xlsx.writeBuffer();
    const form = new FormData();
    form.append('file', new File([bytes], 'template.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    form.append('fileConfig', JSON.stringify({ sheetMappings: [{ sheetName: 'Offre', mapping: { nom: 'A1' } }] }));
    const response = await POST(new NextRequest('https://example.test/api/templates/validate-excel', { method: 'POST', body: form }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ valid: true });
    expect(query.select).not.toHaveBeenCalled();
  });
});

vi.mock('@/lib/security/storage-access', () => ({ signedOrganizationStorageUrl: async (_client: unknown, url: string) => url }));
