import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { parseTeleprospecteurPatch } from '@/lib/propositions/telepros';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teleproId: string }> },
) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const { id, teleproId } = await params;
  try {
    const input = parseTeleprospecteurPatch(await request.json().catch(() => null));
    const service = createServiceClient();
    const { data, error } = await service.from('teleprospecteurs').update(input)
      .eq('id', teleproId)
      .eq('organization_id', id)
      .select('*')
      .single();
    if (error || !data) throw error ?? new Error('Télépro introuvable');
    return NextResponse.json({ telepro: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Données invalides' }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; teleproId: string }> },
) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const { id, teleproId } = await params;
  const service = createServiceClient();
  // Les propositions liées conservent leur historique : la FK est ON DELETE SET NULL.
  const { data, error } = await service.from('teleprospecteurs').delete()
    .eq('id', teleproId)
    .eq('organization_id', id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Télépro introuvable' }, { status: 404 });
  return NextResponse.json({ success: true });
}
