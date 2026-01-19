import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const allowedSecteurs = new Set(['telephonie', 'bureautique', 'mixte']);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.user_metadata?.role === 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const secteur = body?.secteur;

    if (!secteur || typeof secteur !== 'string' || !allowedSecteurs.has(secteur)) {
      return NextResponse.json(
        { error: 'Secteur invalide' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceClient();

    // Empêcher de repasser onboarding si déjà défini
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('secteur')
      .eq('id', user.id)
      .single();

    if (orgError) {
      return NextResponse.json(
        { error: 'Organization introuvable' },
        { status: 404 }
      );
    }

    if (org?.secteur) {
      return NextResponse.json(
        { error: 'Onboarding déjà complété' },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ secteur })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Impossible de mettre à jour l'organization" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error onboarding:', error);
    return NextResponse.json(
      {
        error: 'Failed onboarding',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
