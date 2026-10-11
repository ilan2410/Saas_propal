import { DEFAULT_PROMPT } from '@/lib/templates/default-prompt';
import { CLIENT_TEMPLATE_COLUMNS } from '@/lib/security/client-data';
import { organizationStoragePath } from '@/lib/security/storage-access';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureChampsActifsPlaceholder, updateExpectedJsonStructureFromFields } from '@/lib/utils/prompt';
import { DEFAULT_CLAUDE_MODEL, generateMergedPrompt } from '@/components/admin/organizationFormConfig';
import { resolveOrgContext } from '@/lib/auth/org-context';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    const body = (await request.json()) as Record<string, unknown>;

    console.log('Création template - body reçu:', JSON.stringify(body, null, 2));

    // Validation des champs requis
    const nom = typeof body.nom === 'string' ? body.nom : '';
    const fileType = typeof body.file_type === 'string' ? body.file_type : '';

    if (!nom) {
      return NextResponse.json({ error: 'Le nom est requis', details: 'nom manquant' }, { status: 400 });
    }
    if (!fileType) {
      return NextResponse.json({ error: 'Le type de fichier est requis', details: 'file_type manquant' }, { status: 400 });
    }

    // Créer le template dans la BDD
    const champsActifs = Array.isArray(body.champs_actifs)
      ? (body.champs_actifs.filter((v): v is string => typeof v === 'string') as string[])
      : [];
    const fileConfig =
      body.file_config && typeof body.file_config === 'object' && !Array.isArray(body.file_config)
        ? body.file_config
        : {};

    const insertData: Record<string, unknown> = {
      organization_id: ctx.organizationId,
      nom,
      description: typeof body.description === 'string' ? body.description : null,
      file_type: fileType,
      file_url:
        (typeof body.file_url === 'string' && body.file_url) ||
        (typeof body.template_file_url === 'string' && body.template_file_url) ||
        '',
      file_name:
        (typeof body.file_name === 'string' && body.file_name) || nom || 'template',
      file_size_mb: typeof body.file_size_mb === 'number' ? body.file_size_mb : null,
      champs_actifs: champsActifs,
      file_config: fileConfig,
      statut: 'brouillon',
      claude_model: DEFAULT_CLAUDE_MODEL,
    };

    if (insertData.file_url && (typeof insertData.file_url !== 'string' || !organizationStoragePath(insertData.file_url, 'templates', ctx.organizationId))) {
      return NextResponse.json({ error: 'Fichier template invalide' }, { status: 400 });
    }
    const { data: org } = await createServiceClient().from('organizations').select('secteur').eq('id', ctx.organizationId).single();
    const { data: defaults } = await createServiceClient().from('prompt_defaults').select('prompt_template').eq('secteur', org?.secteur ?? 'telephonie').maybeSingle();
    let prompt = updateExpectedJsonStructureFromFields(defaults?.prompt_template || DEFAULT_PROMPT, champsActifs, { prune: true });
    const merges = Array.isArray(body.merge_config) ? body.merge_config.filter((key): key is string => typeof key === 'string') : [];
    if (merges.length > 1) prompt = generateMergedPrompt(prompt, merges);
    insertData.merge_config = merges;
    insertData.prompt_template = ensureChampsActifsPlaceholder(prompt);

    const { data: template, error } = await createServiceClient()
      .from('proposition_templates')
      .insert(insertData)
      .select(CLIENT_TEMPLATE_COLUMNS)
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
