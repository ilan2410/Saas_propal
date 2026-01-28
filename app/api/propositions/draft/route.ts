import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { cleanupOldPropositions } from '@/lib/propositions/cleanup';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

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

    // Nettoyage préventif AVANT la création (pour ne pas supprimer ce qu'on vient de créer si on est à la limite)
    // Mais ici on veut garder les 15 plus récents. Si on en a 15, on en supprime 1 pour faire de la place.
    // L'appel async ne bloque pas le retour immédiat, mais c'est mieux d'attendre un peu pour éviter les race conditions
    // On le fait en "fire and forget" pour la rapidité, ou await pour la sûreté ?
    // Await est plus sûr pour la cohérence des données.
    await cleanupOldPropositions(serviceSupabase, user.id, 14); // On garde 14 pour laisser la place au 15ème

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
