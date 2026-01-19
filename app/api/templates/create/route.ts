import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    console.log('Création template - body reçu:', JSON.stringify(body, null, 2));

    // Validation des champs requis
    if (!body.nom) {
      return NextResponse.json({ error: 'Le nom est requis', details: 'nom manquant' }, { status: 400 });
    }
    if (!body.file_type) {
      return NextResponse.json({ error: 'Le type de fichier est requis', details: 'file_type manquant' }, { status: 400 });
    }

    const { count: templatesCount, error: countError } = await supabase
      .from('proposition_templates')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.id);

    if (countError) {
      return NextResponse.json(
        { error: 'Erreur lors de la vérification des templates', details: countError.message },
        { status: 500 }
      );
    }

    if ((templatesCount || 0) >= 3) {
      return NextResponse.json(
        { error: 'Limite atteinte', details: 'Vous ne pouvez pas avoir plus de 3 templates. Supprimez-en un pour en créer un nouveau.' },
        { status: 409 }
      );
    }

    // Créer le template dans la BDD
    const insertData: Record<string, any> = {
      organization_id: user.id,
      nom: body.nom,
      description: body.description || null,
      file_type: body.file_type,
      file_url: body.file_url || body.template_file_url || '',
      file_name: body.file_name || body.nom || 'template',
      file_size_mb: body.file_size_mb || null,
      champs_actifs: body.champs_actifs || [],
      file_config: body.file_config || {},
      statut: 'brouillon',
    };

    if (body.prompt_template !== undefined) {
      insertData.prompt_template = ensureChampsActifsPlaceholder(String(body.prompt_template));
    }
    
    console.log('Données à insérer:', JSON.stringify(insertData, null, 2));

    const { data: template, error } = await supabase
      .from('proposition_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Erreur Supabase:', error);
      return NextResponse.json(
        { error: 'Erreur base de données', details: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      {
        error: 'Failed to create template',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
