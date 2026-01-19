import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    console.log('Update proposition:', id);
    console.log('Body reçu:', body);

    // Construire l'objet de mise à jour (sans updated_at car la colonne n'existe pas)
    const updateData: Record<string, any> = {};

    // Mapper les champs selon le schéma de la BDD
    if (body.filled_data !== undefined) {
      updateData.filled_data = body.filled_data;
    }
    if (body.extracted_data !== undefined) {
      updateData.extracted_data = body.extracted_data;
    }
    if (body.template_id !== undefined) {
      updateData.template_id = body.template_id;
    }
    if (body.nom_client !== undefined) {
      updateData.nom_client = body.nom_client;
    }
    if (body.source_documents !== undefined) {
      updateData.source_documents = body.source_documents;
    }
    if (body.current_step !== undefined) {
      updateData.current_step = body.current_step;
    }
    if (body.statut !== undefined) {
      updateData.statut = body.statut;
    }
    
    console.log('Données à mettre à jour:', updateData);

    // Vérifier qu'on a quelque chose à mettre à jour
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 });
    }

    // Mettre à jour la proposition
    const { data: proposition, error } = await supabase
      .from('propositions')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Erreur Supabase:', error);
      return NextResponse.json({ 
        error: 'Erreur base de données', 
        details: error.message,
        code: error.code 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, proposition });
  } catch (error) {
    console.error('Error updating proposition:', error);
    return NextResponse.json(
      {
        error: 'Failed to update proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
