import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WordConfig, SpVariableCustom, SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

const SP_STANDARD_VARIABLES = [
  'sp_economie_mensuelle', 'sp_economie_annuelle', 'sp_total_actuel', 'sp_total_propose',
  'sp_ameliorations', 'sp_fournisseur_propose', 'sp_nb_lignes', 'sp_est_economie',
  'sp_adresse_facturation', 'sp_adresse_facturation_rue', 'sp_adresse_facturation_cp',
  'sp_adresse_facturation_ville', 'sp_adresse_livraison', 'sp_adresse_livraison_rue',
  'sp_adresse_livraison_cp', 'sp_adresse_livraison_ville', 'sp_livraison_identique',
  'sp_fas_total',
];

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('file_config')
    .eq('id', id)
    .single();

  const cfg = (template?.file_config ?? {}) as WordConfig;
  const custom = cfg.spVariablesCustom ?? [];

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

  const { data: template } = await supabase
    .from('proposition_templates')
    .select('file_config')
    .eq('id', id)
    .single();

  if (!template) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });

  const cfg = (template.file_config ?? {}) as WordConfig;
  const existing: SpVariableCustom[] = cfg.spVariablesCustom ?? [];

  if (existing.some((v) => v.key === body.key)) {
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

  if (oldKey !== newKey && existing.some((v) => v.key === newKey)) {
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
