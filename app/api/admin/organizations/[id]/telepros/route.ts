import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { parseTeleprospecteurInput } from '@/lib/propositions/telepros';

async function requireAdmin() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user?.app_metadata?.role === 'admin';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const service = createServiceClient();
  const { data, error } = await service.from('teleprospecteurs').select('*')
    .eq('organization_id', id)
    .order('nom')
    .order('prenom');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ telepros: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  try {
    const input = parseTeleprospecteurInput(await request.json().catch(() => null));
    const service = createServiceClient();
    const { data, error } = await service.from('teleprospecteurs').insert({
      organization_id: id,
      ...input,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Création impossible');
    return NextResponse.json({ telepro: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Données invalides' }, { status: 400 });
  }
}
