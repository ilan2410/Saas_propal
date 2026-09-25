import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { parseTeleprospecteurPatch } from '@/lib/propositions/telepros';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx || ctx.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const input = parseTeleprospecteurPatch(await request.json().catch(() => null));
    const { data, error } = await supabase.from('teleprospecteurs').update(input)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select('*')
      .single();
    if (error || !data) throw error ?? new Error('Télépro introuvable');
    return NextResponse.json({ telepro: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Données invalides' }, { status: 400 });
  }
}
