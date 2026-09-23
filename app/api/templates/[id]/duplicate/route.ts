import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { DEFAULT_CLAUDE_MODEL } from '@/components/admin/organizationFormConfig';
import { safeStorageFileName } from '@/lib/security/validate-upload';
import type { OrganizationPreferences, SpObjectifConfig, SpQuestion } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Options de duplication acceptées (toutes si `options` absent du body).
const ALL_OPTIONS = [
  'fichier', 'description', 'champs', 'mapping', 'prompt', 'merge',
  'questions', 'objectifs', 'variables', 'clauses', 'loyer',
  'remises', 'codes_promo', 'produits', 'mode_client', 'reference',
] as const;

type DuplicateOption = (typeof ALL_OPTIONS)[number];

// Clés de `file_config` copiées pour chaque option.
const FILE_CONFIG_KEYS: Partial<Record<DuplicateOption, string[]>> = {
  mapping: [
    'sheetMappings', 'arrayMappings', 'fieldMappings', 'cellMappings',
    'formatVariables', 'feuilleCiblee', 'preserverFormules', 'cellulesAvecFormules',
    'tableauxDynamiques', 'imagesARemplacer', 'forcerMajusculesVariables',
    'custom_fields', 'custom_array_fields', 'champsFormulaire',
  ],
  variables: ['spVariablesActives', 'spVariablesCustom'],
  clauses: ['spClausesConditionnelles'],
  loyer: ['sp_config_loyer', 'sp_config_resiliation', 'inclure_charges_variables_sa'],
  remises: ['sp_config_remises'],
  codes_promo: ['sp_config_codes_promo'],
  produits: ['sp_preferences_produits', 'spTableauxFusionnes', 'sp_table_product_orders'],
  mode_client: ['sp_config_mode_client'],
  reference: ['sp_config_resume_ref'],
};

// Options qui activent le workflow SP sur la copie.
const SP_OPTIONS: DuplicateOption[] = [
  'questions', 'objectifs', 'variables', 'clauses', 'loyer',
  'remises', 'codes_promo', 'produits', 'mode_client', 'reference',
];

// Remplace récursivement toute string égale à un ancien ID de question
// par le nouvel ID (question_id, depuis_reponse_question, duree_question_id…).
function remapQuestionRefs(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapQuestionRefs(item, idMap));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = remapQuestionRefs(item, idMap);
    }
    return out;
  }
  return value;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    if (ctx.role !== 'owner' && !ctx.permissions.manage_templates) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { options?: unknown };
    const requested = Array.isArray(body.options)
      ? body.options.filter((o): o is DuplicateOption =>
          typeof o === 'string' && (ALL_OPTIONS as readonly string[]).includes(o))
      : null;
    // Absent = tout dupliquer ; tableau fourni = uniquement les options cochées.
    const selected = new Set<DuplicateOption>(requested ?? [...ALL_OPTIONS]);

    // Template source
    const { data: original, error: fetchError } = await supabase
      .from('proposition_templates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Template non trouvé' }, { status: 404 });
    }

    // Questions SP : lues uniquement si l'option est cochée (les objectifs
    // référencent les questions par question_id, donc sans questions copiées
    // ils ne sont pas copiés non plus, et les réglages file_config copiés
    // sans questions gardent des références mortes sans impact).
    const { data: org } = selected.has('questions')
      ? await supabase
          .from('organizations')
          .select('sp_questions, preferences')
          .eq('id', ctx.organizationId)
          .single()
      : { data: null };

    const allQuestions = (org?.sp_questions ?? []) as SpQuestion[];
    const sourceQuestions = allQuestions.filter((q) => q.template_id === id);
    const idMap = new Map<string, string>(
      sourceQuestions.map((q) => [q.id, crypto.randomUUID()]),
    );

    // Copie du fichier Storage (obligatoire si l'option est cochée :
    // partager l'URL ferait supprimer le fichier de l'original lors d'un
    // remplacement via PATCH /api/templates/[id]).
    let fileUrl = '';
    let fileName = `${original.nom} (copie)`;
    let fileSizeMb: number | null = null;
    if (selected.has('fichier') && original.file_url) {
      const urlParts = String(original.file_url).split('/templates/');
      if (urlParts.length <= 1) {
        return NextResponse.json(
          { error: 'Impossible de localiser le fichier du template' },
          { status: 500 }
        );
      }
      const sourcePath = decodeURIComponent(urlParts[1]);
      const extension = sourcePath.split('.').pop() || 'bin';
      const destPath = `${ctx.organizationId}/${safeStorageFileName(original.file_name || 'template', extension)}`;

      const { error: copyError } = await supabase.storage
        .from('templates')
        .copy(sourcePath, destPath);

      if (copyError) {
        console.error('Erreur copie fichier template:', copyError);
        return NextResponse.json(
          { error: 'Erreur lors de la copie du fichier', details: copyError.message },
          { status: 500 }
        );
      }

      const { data: { publicUrl } } = supabase.storage.from('templates').getPublicUrl(destPath);
      fileUrl = publicUrl;
      fileName = original.file_name;
      fileSizeMb = original.file_size_mb;
    }

    // file_config : uniquement les clés des options cochées
    const sourceConfig = (original.file_config ?? {}) as Record<string, unknown>;
    const newFileConfig: Record<string, unknown> = {};
    for (const [option, keys] of Object.entries(FILE_CONFIG_KEYS)) {
      if (!selected.has(option as DuplicateOption)) continue;
      for (const key of keys) {
        if (sourceConfig[key] !== undefined) newFileConfig[key] = sourceConfig[key];
      }
    }
    if (SP_OPTIONS.some((o) => selected.has(o)) && sourceConfig.spEnabled !== undefined) {
      newFileConfig.spEnabled = sourceConfig.spEnabled;
    }

    const insertData: Record<string, unknown> = {
      organization_id: ctx.organizationId,
      nom: `${original.nom} (copie)`,
      description: selected.has('description') ? original.description : null,
      file_type: original.file_type,
      file_url: fileUrl,
      file_name: fileName,
      file_size_mb: fileSizeMb,
      champs_actifs: selected.has('champs') ? original.champs_actifs ?? [] : [],
      file_config: remapQuestionRefs(newFileConfig, idMap),
      statut: 'brouillon',
      test_result: null,
      claude_model:
        selected.has('prompt') && original.claude_model
          ? original.claude_model
          : DEFAULT_CLAUDE_MODEL,
    };

    if (selected.has('prompt') && original.prompt_template) {
      insertData.prompt_template = original.prompt_template;
    }
    if (selected.has('merge') && original.merge_config) {
      insertData.merge_config = original.merge_config;
    }

    const { data: newTemplate, error: insertError } = await supabase
      .from('proposition_templates')
      .insert(insertData)
      .select()
      .single();

    if (insertError || !newTemplate) {
      console.error('Erreur insertion template dupliqué:', insertError);
      return NextResponse.json(
        { error: 'Erreur lors de la duplication', details: insertError?.message },
        { status: 500 }
      );
    }

    // Questions SP
    const orgUpdates: Record<string, unknown> = {};
    if (selected.has('questions') && sourceQuestions.length > 0) {
      const copiedQuestions = sourceQuestions.map(
        (q) =>
          remapQuestionRefs(
            { ...q, id: idMap.get(q.id)!, template_id: newTemplate.id },
            idMap,
          ) as SpQuestion,
      );
      orgUpdates.sp_questions = [...allQuestions, ...copiedQuestions];
    }

    // Objectifs SP (référencent les questions par question_id → inutiles
    // sans la copie des questions)
    if (selected.has('objectifs') && selected.has('questions')) {
      const prefs = (org?.preferences ?? {}) as OrganizationPreferences;
      const allObjectifs = (prefs.sp_objectifs_config ?? []) as SpObjectifConfig[];
      const sourceObjectifs = allObjectifs.filter((o) => o.template_id === id);
      if (sourceObjectifs.length > 0) {
        const copiedObjectifs = sourceObjectifs.map(
          (o) =>
            remapQuestionRefs(
              { ...o, id: crypto.randomUUID(), template_id: newTemplate.id },
              idMap,
            ) as SpObjectifConfig,
        );
        orgUpdates.preferences = {
          ...prefs,
          sp_objectifs_config: [...allObjectifs, ...copiedObjectifs],
        };
      }
    }

    if (Object.keys(orgUpdates).length > 0) {
      const { error: orgError } = await supabase
        .from('organizations')
        .update(orgUpdates)
        .eq('id', ctx.organizationId);

      if (orgError) {
        console.error('Erreur copie réglages SP:', orgError);
        return NextResponse.json(
          {
            error: 'Template créé mais les réglages SP n\'ont pas pu être copiés',
            details: orgError.message,
            template: newTemplate,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, template: newTemplate });
  } catch (error) {
    console.error('Erreur duplication template:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de la duplication',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
