import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Récupérer la proposition originale
    const { data: originalProposition, error: fetchError } = await supabase
      .from('propositions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (fetchError || !originalProposition) {
      return NextResponse.json(
        { error: 'Proposition non trouvée' },
        { status: 404 }
      );
    }

    // Extraire le nom du client
    const extractedData = originalProposition.extracted_data || originalProposition.donnees_extraites || {};
    let clientName = 'Client';
    
    if (extractedData.client?.nom) {
      clientName = extractedData.client.nom;
    } else if (extractedData['client.nom']) {
      clientName = extractedData['client.nom'];
    } else if (originalProposition.nom_client) {
      clientName = originalProposition.nom_client;
    }

    // Créer la nouvelle proposition
    const { data: newProposition, error: insertError } = await supabase
      .from('propositions')
      .insert({
        organization_id: user.id,
        template_id: originalProposition.template_id,
        nom_client: `[COPIE] ${clientName}`,
        statut: originalProposition.extracted_data || originalProposition.donnees_extraites ? 'ready' : 'draft',
        source_documents: originalProposition.source_documents || originalProposition.documents_urls || originalProposition.documents_sources_urls || [],
        extracted_data: originalProposition.extracted_data || originalProposition.donnees_extraites || null,
        donnees_extraites: originalProposition.extracted_data || originalProposition.donnees_extraites || null,
        duplicated_template_url: null,
        fichier_genere_url: null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !newProposition) {
      console.error('Erreur insertion:', insertError);
      return NextResponse.json(
        { error: 'Erreur lors de la duplication' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: newProposition.id,
    });
  } catch (error) {
    console.error('Erreur duplication proposition:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de la duplication',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
