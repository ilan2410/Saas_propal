import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder, updateExpectedJsonStructureFromFields } from '@/lib/utils/prompt';
import { BUREAUTIQUE_DEFAULT_PROMPT } from '@/lib/templates/bureautique-prompt';
import { withRequiredTemplateFields } from '@/lib/templates/required-fields';
import { defaultSecteur, isAllowedSecteur } from '@/lib/sectors';
import type { Secteur } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();

    console.log('Admin template create - body reçu:', JSON.stringify(body, null, 2));

    if (!body.organization_id || !body.nom) {
      return NextResponse.json(
        { error: 'organization_id et nom sont requis' },
        { status: 400 }
      );
    }

    // Utiliser le service role pour créer le template
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: organization } = await supabase.from('organizations').select('secteur')
      .eq('id', body.organization_id).single();
    const orgSecteur = organization?.secteur as Secteur;
    const secteur = body.secteur ?? (orgSecteur && defaultSecteur(orgSecteur));
    if (!orgSecteur || (orgSecteur === 'mixte' && body.secteur === undefined) || !isAllowedSecteur(orgSecteur, secteur)) {
      return NextResponse.json({ error: 'Secteur invalide' }, { status: 400 });
    }

    // Créer le template avec les colonnes de base
    const insertData: Record<string, unknown> = {
      organization_id: body.organization_id,
      secteur,
      nom: body.nom,
      description: body.description || null,
      file_type: body.file_type || 'excel',
      file_url: body.file_url || '',
      file_name: body.file_name || body.nom || 'template',
      file_size_mb: body.file_size_mb || null,
      champs_actifs: withRequiredTemplateFields(secteur, Array.isArray(body.champs_actifs) ? body.champs_actifs : []),
      file_config: body.file_config || {},
      statut: 'brouillon',
    };
    
    // Ajouter les colonnes optionnelles (peuvent ne pas exister dans la DB)
    if (body.claude_model) insertData.claude_model = body.claude_model;
    if (body.prompt_template !== undefined) {
      insertData.prompt_template = ensureChampsActifsPlaceholder(updateExpectedJsonStructureFromFields(
        String(body.prompt_template), insertData.champs_actifs as string[], { prune: true },
      ));
    } else {
      const { data: defaultPrompt } = await supabase.from('prompt_defaults')
        .select('prompt_template').eq('secteur', secteur).maybeSingle();
      const prompt = defaultPrompt?.prompt_template || (secteur === 'bureautique' ? BUREAUTIQUE_DEFAULT_PROMPT : '');
      if (prompt) insertData.prompt_template = ensureChampsActifsPlaceholder(updateExpectedJsonStructureFromFields(
        prompt, insertData.champs_actifs as string[], { prune: true },
      ));
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
