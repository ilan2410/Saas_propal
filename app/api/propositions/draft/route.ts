import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const template_id = typeof body?.template_id === 'string' ? body.template_id : null;
    const nom_client = typeof body?.nom_client === 'string' ? body.nom_client : null;
    const source_documents = Array.isArray(body?.source_documents) ? body.source_documents : [];
    const current_step = typeof body?.current_step === 'number' ? body.current_step : 1;

    const { data: proposition, error } = await supabase
      .from('propositions')
      .insert({
        organization_id: user.id,
        template_id,
        nom_client,
        source_documents,
        statut: 'draft',
        current_step,
      })
      .select('*')
      .single();

    if (error || !proposition) {
      return NextResponse.json(
        {
          error: 'Failed to create draft proposition',
          details: error?.message || 'Unknown error',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, proposition });
  } catch (error) {
    console.error('Error creating draft proposition:', error);
    return NextResponse.json(
      {
        error: 'Failed to create draft proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
