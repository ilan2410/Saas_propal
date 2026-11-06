import type { SupabaseClient, User } from '@supabase/supabase-js';
import { resolveOrgContext } from './org-context';
import { createServiceClient } from '@/lib/supabase/server';

/** Admin editing is explicitly scoped to an existing client organization. */
export async function resolveTemplateEditorContext(client: SupabaseClient, user: User, organizationId: FormDataEntryValue | null) {
  if (user.app_metadata?.role === 'admin' && typeof organizationId === 'string' && organizationId) {
    const service = createServiceClient();
    // Resolve the client's owner profile; authentication remains the admin's above.
    const ctx = await resolveOrgContext(service, { ...user, id: organizationId });
    return ctx?.role === 'owner' ? { client: service, ctx } : null;
  }
  const ctx = await resolveOrgContext(client, user);
  return ctx ? { client, ctx } : null;
}
