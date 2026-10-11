import { clientPreferences } from '@/lib/security/client-data';
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await createServiceClient().from('organizations')
      .select('preferences')
      .eq('id', ctx.organizationId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ preferences: clientPreferences(data?.preferences, ctx) });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}
