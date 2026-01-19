import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const allowedSecteurs = new Set(['telephonie', 'bureautique', 'mixte']);

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const supabaseAdmin = createServiceClient();
    const { data, error } = await supabaseAdmin
      .from('prompt_defaults')
      .select('secteur,prompt_template,updated_at')
      .order('secteur', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Erreur lecture prompt defaults', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, prompt_defaults: data || [] });
  } catch (error) {
    console.error('Error reading prompt defaults:', error);
    return NextResponse.json(
      {
        error: 'Failed to read prompt defaults',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const secteur = body?.secteur;
    const prompt_template = body?.prompt_template;

    if (!secteur || typeof secteur !== 'string' || !allowedSecteurs.has(secteur)) {
      return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });
    }

    if (!prompt_template || typeof prompt_template !== 'string' || !prompt_template.trim()) {
      return NextResponse.json({ error: 'Prompt invalide' }, { status: 400 });
    }

    const supabaseAdmin = createServiceClient();

    const { data, error } = await supabaseAdmin
      .from('prompt_defaults')
      .upsert(
        {
          secteur,
          prompt_template,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'secteur' }
      )
      .select('secteur,prompt_template,updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Erreur mise à jour prompt default', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, prompt_default: data });
  } catch (error) {
    console.error('Error updating prompt defaults:', error);
    return NextResponse.json(
      {
        error: 'Failed to update prompt defaults',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
