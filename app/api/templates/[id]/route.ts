import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder } from '@/lib/utils/prompt';
import { resolveOrgContext } from '@/lib/auth/org-context';

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

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (ctx.role !== 'owner' && !ctx.permissions.manage_templates) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Récupérer le template pour connaître le fichier à nettoyer
    const { data: template } = await supabase
      .from('proposition_templates')
      .select('file_url')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .single();

    const { error } = await supabase
      .from('proposition_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Nettoyage des données associées (best-effort : la ligne est déjà supprimée)

    // 1. Fichier dans le bucket Storage
    if (template?.file_url) {
      try {
        const urlParts = String(template.file_url).split('/templates/');
        if (urlParts.length > 1) {
          await supabase.storage
            .from('templates')
            .remove([decodeURIComponent(urlParts[1])]);
        }
      } catch (err) {
        console.error('Erreur suppression fichier template:', err);
      }
    }

    // 2. Questions SP + objectifs SP (JSONB sur l'organisation, filtrés par template_id)
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('sp_questions, preferences')
        .eq('id', ctx.organizationId)
        .single();

      if (org) {
        const questions = (org.sp_questions ?? []) as { template_id?: string }[];
        const remainingQuestions = questions.filter((q) => q.template_id !== id);

        const prefs = (org.preferences ?? {}) as Record<string, unknown>;
        const objectifs = Array.isArray(prefs.sp_objectifs_config)
          ? (prefs.sp_objectifs_config as { template_id?: string }[])
          : [];
        const remainingObjectifs = objectifs.filter((o) => o.template_id !== id);

        const updates: Record<string, unknown> = {};
        if (remainingQuestions.length !== questions.length) {
          updates.sp_questions = remainingQuestions;
        }
        if (remainingObjectifs.length !== objectifs.length) {
          updates.preferences = { ...prefs, sp_objectifs_config: remainingObjectifs };
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('organizations')
            .update(updates)
            .eq('id', ctx.organizationId);
        }
      }
    } catch (err) {
      console.error('Erreur nettoyage réglages SP du template:', err);
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

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (ctx.role !== 'owner' && !ctx.permissions.manage_templates) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
          .eq('organization_id', ctx.organizationId)
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
      .eq('organization_id', ctx.organizationId)
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
