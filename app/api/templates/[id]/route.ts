import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Récupérer un template
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: template, error } = await supabase
      .from('proposition_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un template
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('proposition_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

// PATCH - Mettre à jour un template
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (body.prompt_template !== undefined) {
      body.prompt_template = ensureChampsActifsPlaceholder(String(body.prompt_template));
    }

    // Si l'URL du fichier change, supprimer l'ancien fichier
    if (body.file_url) {
      try {
        // Récupérer l'ancien template
        const { data: oldTemplate } = await supabase
          .from('proposition_templates')
          .select('file_url')
          .eq('id', id)
          .eq('organization_id', user.id)
          .single();

        if (oldTemplate?.file_url && oldTemplate.file_url !== body.file_url) {
          // Extraire le chemin du fichier depuis l'URL
          const urlParts = oldTemplate.file_url.split('/templates/');
          if (urlParts.length > 1) {
            const rawPath = urlParts[1];
            const filePath = decodeURIComponent(rawPath);
            console.log('Suppression de l\'ancien fichier (Client):', filePath);
            
            await supabase.storage
              .from('templates')
              .remove([filePath]);
          }
        }
      } catch (err) {
        console.error('Erreur nettoyage ancien fichier:', err);
        // On continue
      }
    }

    const { data: template, error } = await supabase
      .from('proposition_templates')
      .update(body)
      .eq('id', id)
      .eq('organization_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}
