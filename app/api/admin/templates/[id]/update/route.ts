import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    console.log('Admin template update - body reçu:', JSON.stringify(body, null, 2));

    // Utiliser le service role pour mettre à jour le template
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Construire l'objet de mise à jour avec les bons noms de colonnes
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.nom !== undefined) updateData.nom = body.nom;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.file_type !== undefined) updateData.file_type = body.file_type;
    if (body.file_url !== undefined) updateData.file_url = body.file_url;
    if (body.file_name !== undefined) updateData.file_name = body.file_name;
    if (body.file_size_mb !== undefined) updateData.file_size_mb = body.file_size_mb;
    if (body.champs_actifs !== undefined) updateData.champs_actifs = body.champs_actifs;
    if (body.file_config !== undefined) updateData.file_config = body.file_config;
    if (body.statut !== undefined) updateData.statut = body.statut;
    if (body.test_result !== undefined) updateData.test_result = body.test_result;
    if (body.claude_model !== undefined) updateData.claude_model = body.claude_model;
    if (body.prompt_template !== undefined) {
      updateData.prompt_template = ensureChampsActifsPlaceholder(String(body.prompt_template));
    }
    if (body.merge_config !== undefined) updateData.merge_config = body.merge_config;
    
    console.log('Données à mettre à jour:', JSON.stringify(updateData, null, 2));

    // Si l'URL du fichier change, supprimer l'ancien fichier
    if (body.file_url) {
      try {
        // Récupérer l'ancien template pour avoir l'ancienne URL
        const { data: oldTemplate } = await supabase
          .from('proposition_templates')
          .select('file_url')
          .eq('id', id)
          .single();

        if (oldTemplate?.file_url && oldTemplate.file_url !== body.file_url) {
          // Extraire le chemin du fichier depuis l'URL
          // Format URL: .../storage/v1/object/public/templates/userId/filename
          const urlParts = oldTemplate.file_url.split('/templates/');
          if (urlParts.length > 1) {
            const rawPath = urlParts[1]; // ex: userId/filename (encodé)
            const filePath = decodeURIComponent(rawPath); // Décoder pour avoir le vrai chemin
            
            console.log('Tentative de suppression ancien fichier:', {
              oldUrl: oldTemplate.file_url,
              newUrl: body.file_url,
              extractedPath: filePath
            });
            
            const { error: deleteError } = await supabase.storage
              .from('templates')
              .remove([filePath]);
              
            if (deleteError) {
              console.error('Erreur lors de la suppression de l\'ancien fichier:', deleteError);
            } else {
              console.log('Ancien fichier supprimé avec succès');
            }
          } else {
            console.warn('Impossible d\'extraire le chemin du fichier de l\'URL:', oldTemplate.file_url);
          }
        }
      } catch (err) {
        console.error('Erreur lors du nettoyage de l\'ancien fichier:', err);
        // On continue même si la suppression échoue
      }
    }

    // Mettre à jour le template
    const { data: template, error } = await supabase
      .from('proposition_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erreur mise à jour template:', error);
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du template', details: error.message },
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
