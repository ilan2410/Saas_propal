import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), service: {} }));
vi.mock('./org-context', () => ({ resolveOrgContext: mocks.resolve }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mocks.service }));
import { resolveTemplateEditorContext } from './template-editor-context';
const client = {} as SupabaseClient;
const user = { id: 'actor', app_metadata: {} } as User;
beforeEach(() => mocks.resolve.mockReset());
describe('template editor organization access', () => {
  it('ignores a client-supplied organization for non-admins', async () => {
    const ctx = { organizationId: 'own', role: 'owner' };
    mocks.resolve.mockResolvedValue(ctx);
    expect(await resolveTemplateEditorContext(client, user, 'other')).toEqual({ client, ctx });
    expect(mocks.resolve).toHaveBeenCalledWith(client, user);
  });
  it('scopes admins to the selected existing owner organization', async () => {
    const ctx = { organizationId: 'target', role: 'owner' };
    mocks.resolve.mockResolvedValue(ctx);
    expect(await resolveTemplateEditorContext(client, { ...user, app_metadata: { role: 'admin' } }, 'target')).toEqual({ client: mocks.service, ctx });
    expect(mocks.resolve).toHaveBeenCalledWith(mocks.service, expect.objectContaining({ id: 'target' }));
  });
  it.each([null, { role: 'commercial' }])('rejects a target without an owner organization', async ctx => {
    mocks.resolve.mockResolvedValue(ctx);
    expect(await resolveTemplateEditorContext(client, { ...user, app_metadata: { role: 'admin' } }, 'missing')).toBeNull();
  });
});
