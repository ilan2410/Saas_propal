import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templateId = request.nextUrl.searchParams.get('template_id');
    if (!templateId) {
      return NextResponse.json({ error: 'template_id requis' }, { status: 400 });
    }

    const { data: proposition } = await supabase
      .from('propositions')
      .select('id, extracted_data')
      .eq('organization_id', user.id)
      .eq('template_id', templateId)
      .not('extracted_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      extracted_data: proposition?.extracted_data ?? null,
      proposition_id: proposition?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
