import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/propositions/[id]/route';
import { GET as exportData } from '@/app/api/settings/export-data/route';
import { GET as tarifs } from '@/app/api/settings/tarifs/route';

const state = vi.hoisted(() => ({
  user: { id: '11111111-1111-1111-1111-111111111111' } as { id: string } | null,
  role: 'owner',
  billing: true,
  proposition: {} as Record<string, unknown>,
  remove: vi.fn().mockResolvedValue({ error: null }),
  from: vi.fn(),
}));

vi.mock('@/lib/auth/org-context', () => ({ resolveOrgContext: async () => ({ organizationId: state.user?.id, role: state.role, permissions: { view_all_propositions: true, view_credits_billing: state.billing } }) }));
vi.mock('@/lib/supabase/server', () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: state.from,
    storage: { from: () => ({ remove: state.remove }) },
  };
  return { createClient: async () => client, createServiceClient: () => client };
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.test');
  state.user = { id: '11111111-1111-1111-1111-111111111111' };
  state.role = 'owner'; state.billing = true;
  state.proposition = { id: 'proposal', source_documents: [], duplicated_template_url: null };
  state.remove.mockClear(); state.from.mockReset();
  state.from.mockImplementation((table: string) => {
    const result = { data: table === 'propositions' ? state.proposition : [], error: null };
    const query = {
      select: () => query, eq: () => query, delete: () => query,
      single: async () => result,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  });
});

describe('organization API access regressions', () => {
  it('cannot delete another tenant files through malicious saved document or output URLs', async () => {
    const foreign = '22222222-2222-2222-2222-222222222222';
    state.proposition.source_documents = [
      `https://project.test/storage/v1/object/public/documents/${foreign}/secret.pdf`,
      `https://evil.test/documents/${state.user!.id}/secret.pdf`,
    ];
    state.proposition.duplicated_template_url = `https://project.test/storage/v1/object/public/templates/generated/${foreign}/offer.docx`;
    const response = await DELETE(new NextRequest('https://app.test/api/propositions/proposal', { method: 'DELETE' }), { params: Promise.resolve({ id: 'proposal' }) });
    expect(response.status).toBe(200);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('still cleans up authorized source documents and generated files', async () => {
    const org = state.user!.id;
    state.proposition.source_documents = [`https://project.test/storage/v1/object/public/documents/${org}/invoice.pdf`];
    state.proposition.duplicated_template_url = `https://project.test/storage/v1/object/public/templates/generated/${org}/offer.docx`;
    expect((await DELETE(new NextRequest('https://app.test/api/propositions/proposal', { method: 'DELETE' }), { params: Promise.resolve({ id: 'proposal' }) })).status).toBe(200);
    expect(state.remove).toHaveBeenCalledWith([`${org}/invoice.pdf`]);
    expect(state.remove).toHaveBeenCalledWith([`generated/${org}/offer.docx`]);
  });
  it('billing permission alone does not authorize a complete tenant export', async () => {
    state.role = 'commercial';
    expect((await exportData()).status).toBe(403);
    expect(state.from).not.toHaveBeenCalled();
  });
  it('does not return balances without the billing permission', async () => {
    state.role = 'commercial'; state.billing = false;
    expect((await tarifs()).status).toBe(403);
    expect(state.from).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated exports', async () => {
    state.user = null;
    expect((await exportData()).status).toBe(401);
  });
});
