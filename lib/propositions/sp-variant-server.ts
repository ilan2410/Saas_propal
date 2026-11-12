import { createServiceClient } from '@/lib/supabase/server';
import type { SpVariant } from './sp-variants';

// Call only after user-scoped parent authorization (including sector) succeeds.
export async function loadSpVariant(propositionId: string, organizationId: string, variantId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variantId)) return null;
  const { data, error } = await createServiceClient().from('proposition_sp_variants').select('*')
    .eq('id', variantId).eq('proposition_id', propositionId).eq('organization_id', organizationId).maybeSingle();
  if (error) throw error;
  return data as SpVariant | null;
}
