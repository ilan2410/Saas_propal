import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WordConfig, SpVariableCustom, SpQuestion, SpClauseConditionnelle } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

const SP_STANDARD_VARIABLES = [
  // Économies & totaux principaux
  'sp_economie_mensuelle', 'sp_economie_annuelle', 'sp_total_actuel', 'sp_total_propose',
  'sp_ameliorations', 'sp_fournisseur_propose', 'sp_nb_lignes', 'sp_est_economie',
  // Référence proposition (partie fixe + loyer final, cf. config Référence du template)
  'sp_reference',
  // Adresses
  'sp_adresse_facturation', 'sp_adresse_facturation_rue', 'sp_adresse_facturation_cp',
  'sp_adresse_facturation_ville', 'sp_adresse_livraison', 'sp_adresse_livraison_rue',
  'sp_adresse_livraison_cp', 'sp_adresse_livraison_ville', 'sp_livraison_identique',
  // Récurrent / Ponctuel
  'sp_fas_total', 'sp_total_recurrent', 'sp_total_ponctuel', 'sp_total_indemnites',
  'sp_remise_mois_offert', 'sp_total_installation', 'sp_total_materiel_achat',
  'sp_total_remise', 'sp_remise_fixe', 'sp_remise_mobile', 'sp_remise_abonnement', 'sp_remise_internet',
  // Loyer / Marge
  'sp_loyer_mensuel', 'sp_loyer_trimestriel', 'sp_marge',
  'sp_duree_mois', 'sp_trimestres', 'sp_mois_offerts',
  // Tables filtrées (Lot 4)
  'sp_situation_proposee_complet', 'sp_situation_proposee_forfaits', 'sp_situation_proposee_forfaits_sans_remise',
  'sp_materiel_detail',
  'sp_bdc_operateur_table', 'sp_bdc_internet_table', 'sp_bdc_materiel_table',
  'sp_cadeaux_table',
  // Variables simples (Lot 4)
  'sp_date_limite_souscription', 'sp_duree_trimestres',
  'sp_total_forfaits_mensuel_ht', 'sp_total_materiel_ht',
  'sp_total_bdc_operateur_ht', 'sp_total_bdc_internet_ht',
  'sp_total_bdc_materiel_ht', 'sp_total_cadeaux_ht', 'sp_total_complet',
];

function buildQuestionDerivedVariables(
  questions: SpQuestion[],
  existingCustom: SpVariableCustom[],
): SpVariableCustom[] {
  const existingKeys = new Set(existingCustom.map((variable) => variable.key));
  const derived = new Map<string, SpVariableCustom>();

  for (const question of questions) {
    for (const consequence of question.consequences ?? []) {
      const variableKey = consequence.variable_cible?.trim();
      if (
        consequence.type !== 'renseigner_variable' ||
        !variableKey ||
        existingKeys.has(variableKey) ||
        SP_STANDARD_VARIABLES.includes(variableKey) ||
        derived.has(variableKey)
      ) {
        continue;
      }

      const questionLabel = question.libelle?.trim() || 'question SP';
      derived.set(variableKey, {
        key: variableKey,
        label: questionLabel,
        description: `Variable alimentee par la question SP "${questionLabel}".`,
        type: 'string',
      });
    }
  }

  return Array.from(derived.values());
}

/** Variables Word dérivées des clauses conditionnelles : {{sp_clause_<cle>}}. */
function buildClauseDerivedVariables(
  clauses: SpClauseConditionnelle[],
  existingCustom: SpVariableCustom[],
): SpVariableCustom[] {
  const existingKeys = new Set(existingCustom.map((variable) => variable.key));
  const derived = new Map<string, SpVariableCustom>();

  for (const clause of clauses) {
    const cle = (clause.cle_variable ?? '').trim();
    if (!cle) continue;
    const key = `sp_clause_${cle}`;
    if (existingKeys.has(key) || SP_STANDARD_VARIABLES.includes(key) || derived.has(key)) continue;
    derived.set(key, {
      key,
      label: clause.libelle?.trim() || `Clause ${cle}`,
      description: 'Phrase conditionnelle injectée selon les conditions configurées.',
      type: 'string',
    });
  }

  return Array.from(derived.values());
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: template }, { data: org }] = await Promise.all([
    supabase
      .from('proposition_templates')
      .select('file_config')
      .eq('id', id)
      .single(),
    supabase
      .from('organizations')
      .select('sp_questions')
      .eq('id', user.id)
      .single(),
  ]);

  const cfg = (template?.file_config ?? {}) as WordConfig;
  const storedCustom = cfg.spVariablesCustom ?? [];
  const templateQuestions = ((org?.sp_questions ?? []) as SpQuestion[]).filter((question) => question.template_id === id);
  const derivedCustom = buildQuestionDerivedVariables(templateQuestions, storedCustom);
  const clauseCustom = buildClauseDerivedVariables(cfg.spClausesConditionnelles ?? [], [...storedCustom, ...derivedCustom]);
  const custom = [...storedCustom, ...derivedCustom, ...clauseCustom];

  return NextResponse.json({ standard: SP_STANDARD_VARIABLES, custom });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { key?: string; label?: string; description?: string; type?: string };
  if (!body.key || !body.label) {
    return NextResponse.json({ error: 'key et label requis' }, { status: 400 });
  }

  const [{ data: template }, { data: org }] = await Promise.all([
    supabase
      .from('proposition_templates')
      .select('file_config')
      .eq('id', id)
      .single(),
    supabase
      .from('organizations')
      .select('sp_questions')
      .eq('id', user.id)
      .single(),
  ]);

  if (!template) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });

  const cfg = (template.file_config ?? {}) as WordConfig;
  const existing: SpVariableCustom[] = cfg.spVariablesCustom ?? [];
  const templateQuestions = ((org?.sp_questions ?? []) as SpQuestion[]).filter((question) => question.template_id === id);
  const derivedKeys = new Set(buildQuestionDerivedVariables(templateQuestions, existing).map((variable) => variable.key));

  if (existing.some((v) => v.key === body.key) || derivedKeys.has(body.key)) {
    return NextResponse.json({ error: 'Cette cl\u00e9 existe d\u00e9j\u00e0' }, { status: 409 });
  }

  const newVar: SpVariableCustom = {
    key: body.key,
    label: body.label,
    description: body.description ?? '',
    type: (body.type as SpVariableCustom['type']) ?? 'string',
  };

  const updatedConfig = { ...cfg, spVariablesCustom: [...existing, newVar] };

  const { error } = await supabase
    .from('proposition_templates')
    .update({ file_config: updatedConfig })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ variable: newVar });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { oldKey?: string; newKey?: string; label?: string };
  const oldKey = body.oldKey?.trim();
  const newKey = body.newKey?.trim();
  const nextLabel = body.label?.trim();

  if (!oldKey || !newKey) {
    return NextResponse.json({ error: 'oldKey et newKey requis' }, { status: 400 });
  }

  if (SP_STANDARD_VARIABLES.includes(oldKey)) {
    return NextResponse.json({ error: 'Les variables standard ne peuvent pas être renommées' }, { status: 400 });
  }

  const [{ data: template }, { data: org }] = await Promise.all([
    supabase
      .from('proposition_templates')
      .select('file_config')
      .eq('id', id)
      .single(),
    supabase
      .from('organizations')
      .select('sp_questions')
      .eq('id', user.id)
      .single(),
  ]);

  if (!template) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });

  const cfg = (template.file_config ?? {}) as WordConfig;
  const existing: SpVariableCustom[] = cfg.spVariablesCustom ?? [];
  const templateQuestions = ((org?.sp_questions ?? []) as SpQuestion[]).filter((question) => question.template_id === id);
  const derivedKeys = new Set(buildQuestionDerivedVariables(templateQuestions, existing).map((variable) => variable.key));

  if (oldKey !== newKey && (existing.some((v) => v.key === newKey) || derivedKeys.has(newKey))) {
    return NextResponse.json({ error: 'Cette clé existe déjà' }, { status: 409 });
  }

  const updatedCustom = existing.map((variable) =>
    variable.key === oldKey
      ? {
          ...variable,
          key: newKey,
          label: nextLabel || variable.label,
        }
      : variable,
  );

  const allQuestions: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const updatedQuestions = allQuestions.map((question) => {
    if (question.template_id !== id) return question;
    if (!question.consequences?.length) return question;
    return {
      ...question,
      consequences: question.consequences.map((consequence) =>
        consequence.variable_cible === oldKey
          ? { ...consequence, variable_cible: newKey }
          : consequence,
      ),
    };
  });

  const updatedConfig = { ...cfg, spVariablesCustom: updatedCustom };

  const [templateUpdate, orgUpdate] = await Promise.all([
    supabase
      .from('proposition_templates')
      .update({ file_config: updatedConfig })
      .eq('id', id),
    supabase
      .from('organizations')
      .update({ sp_questions: updatedQuestions })
      .eq('id', user.id),
  ]);

  if (templateUpdate.error) return NextResponse.json({ error: templateUpdate.error.message }, { status: 500 });
  if (orgUpdate.error) return NextResponse.json({ error: orgUpdate.error.message }, { status: 500 });

  return NextResponse.json({
    variable: {
      oldKey,
      key: newKey,
      label: nextLabel || existing.find((v) => v.key === oldKey)?.label || newKey,
    },
  });
}
