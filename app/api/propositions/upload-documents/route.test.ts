import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ validate: vi.fn(), upload: vi.fn(), serviceFrom: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'member-a' } } }) }, storage: { from: () => ({ upload: state.upload }) } }),
  createServiceClient: () => ({ from: state.serviceFrom }),
}));
vi.mock('@/lib/auth/org-context', () => ({ resolveOrgContext: async () => ({ organizationId: 'org', role: 'commercial', permissions: { view_all_propositions: false } }) }));
vi.mock('@/lib/propositions/note-access', () => ({ requireVisibleProposition: async () => { throw new Error('proposition_not_found'); } }));
vi.mock('@/lib/security/validate-upload', () => ({ validateUploadedFile: state.validate, safeStorageFileName: () => 'dummy.png' }));
import { POST } from './route';

describe('source attachment parent boundary', () => {
  it('rejects a hidden parent before file validation, storage writes or privileged table access', async () => {
    const form = new FormData();
    form.append('proposition_id', 'colleague-proposition');
    form.append('files', new File(['dummy'], 'dummy.png'));
    const response = await POST(new NextRequest('https://app.test/api/propositions/upload-documents', { method: 'POST', body: form }));
    expect(response.status).toBe(404);
    expect(state.validate).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.serviceFrom).not.toHaveBeenCalled();
  });
});
