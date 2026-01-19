import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('Admin template create - body reçu:', JSON.stringify(body, null, 2));

    if (!body.organization_id || !body.nom) {
      return NextResponse.json(
        { error: 'organization_id et nom sont requis' },
        { status: 400 }
      );
    }

    // Utiliser le service role pour créer le template
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Créer le template avec les colonnes de base
    const insertData: Record<string, any> = {
      organization_id: body.organization_id,
      nom: body.nom,
      description: body.description || null,
      file_type: body.file_type || 'excel',
      file_url: body.file_url || '',
      file_name: body.file_name || body.nom || 'template',
      file_size_mb: body.file_size_mb || null,
      champs_actifs: body.champs_actifs || [],
      file_config: body.file_config || {},
      statut: 'brouillon',
    };
    
    // Ajouter les colonnes optionnelles (peuvent ne pas exister dans la DB)
    if (body.claude_model) insertData.claude_model = body.claude_model;
    if (body.prompt_template !== undefined) {
      insertData.prompt_template = ensureChampsActifsPlaceholder(String(body.prompt_template));
    }
    if (body.merge_config && body.merge_config.length > 0) insertData.merge_config = body.merge_config;
    
    console.log('Données à insérer:', JSON.stringify(insertData, null, 2));

    const { data: template, error } = await supabase
      .from('proposition_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Erreur création template:', error);
      return NextResponse.json(
        { error: 'Erreur lors de la création du template', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error('Erreur:', error);
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
