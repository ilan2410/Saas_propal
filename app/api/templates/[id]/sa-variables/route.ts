import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('champs_actifs')
    .eq('id', id)
    .single();

  return NextResponse.json({ variables: template?.champs_actifs ?? [] });
}
