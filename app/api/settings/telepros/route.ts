import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { parseTeleprospecteurInput } from '@/lib/propositions/telepros';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let query = supabase.from('teleprospecteurs').select('*').eq('organization_id', ctx.organizationId);
  if (ctx.role !== 'owner') query = query.eq('actif', true);
  const { data, error } = await query.order('nom').order('prenom');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ telepros: data ?? [], canManage: ctx.role === 'owner' });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx || ctx.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const input = parseTeleprospecteurInput(await request.json().catch(() => null));
    const { data, error } = await supabase.from('teleprospecteurs').insert({
      organization_id: ctx.organizationId,
      ...input,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Création impossible');
    return NextResponse.json({ telepro: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Données invalides' }, { status: 400 });
  }
}
