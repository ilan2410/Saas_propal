import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = user.app_metadata?.role === 'admin' ? createServiceClient() : supabase;
  const { data: template } = await db
    .from('proposition_templates')
    .select('champs_actifs')
    .eq('id', id)
    .single();

  return NextResponse.json({ variables: template?.champs_actifs ?? [] });
}
