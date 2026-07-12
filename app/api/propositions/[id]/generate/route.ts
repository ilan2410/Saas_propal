import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generatePropositionFile } from '@/lib/generators';
import { renderClauses } from '@/lib/sp/renderClauses';
import { buildSpReference } from '@/lib/sp/buildReference';
import { repairMaterialDetailFromQuestionnaire } from '@/lib/sp/repairMaterialDetail';
import type { CatalogueProduit, SpClauseConditionnelle, SpQuestion, SpQuestionReponse, SuggestionsSpCompletes, SpPreferencesProduits, SpConfigLoyer, SpConfigResumeRef, OrganizationPreferences } from '@/types';

type UnknownRecord = Record<string, unknown>;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Récupérer la proposition
    const { data: proposition, error: propError } = await supabase
      .from('propositions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', user.id)
      .single();

    if (propError || !proposition) {
      return NextResponse.json({ error: 'Proposition not found' }, { status: 404 });
    }

    // Récupérer le template (scopé à l'organisation de l'utilisateur pour éviter
    // qu'un utilisateur authentifié puisse déclencher une génération sur un
    // template appartenant à une autre organisation).
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select('*')
      .eq('id', proposition.template_id)
      .eq('organization_id', user.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Fusionner extracted_data + filled_data pour conserver les champs SA riches
    // tout en laissant les éventuelles corrections utilisateur prendre la priorité.
    const extracted =
      proposition.extracted_data && typeof proposition.extracted_data === 'object'
        ? proposition.extracted_data
        : {};
    const filled =
      proposition.filled_data && typeof proposition.filled_data === 'object'
        ? proposition.filled_data
        : {};
    const donnees = { ...extracted, ...filled };

    const { data: organization } = await supabase
      .from('organizations')
      .select('sp_questions, credits, tarif_par_proposition, preferences')
      .eq('id', user.id)
      .single();

    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .or(`organization_id.eq.${user.id},organization_id.is.null`);

    const allQuestions = Array.isArray(organization?.sp_questions) ? organization.sp_questions as SpQuestion[] : [];
    const templateQuestions = allQuestions.filter((question) => question.template_id === proposition.template_id);
    const spReponses = Array.isArray(proposition.sp_reponses) ? proposition.sp_reponses as SpQuestionReponse[] : [];
    const catalogue = Array.isArray(catalogueRows) ? catalogueRows as CatalogueProduit[] : [];
    const templateFileCfg = typeof template.file_config === 'object' && template.file_config !== null ? template.file_config as UnknownRecord : {};
    const spPreferencesProduits = typeof templateFileCfg.sp_preferences_produits === 'object' && templateFileCfg.sp_preferences_produits !== null
      ? templateFileCfg.sp_preferences_produits as SpPreferencesProduits
      : undefined;
    const suggestionsSpCompletes = repairMaterialDetailFromQuestionnaire(
      (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null,
      spReponses,
      templateQuestions,
      catalogue,
      donnees as UnknownRecord,
      spPreferencesProduits,
    );

    // Clauses conditionnelles → variables Word {{sp_clause_<cle>}}
    const clauses = Array.isArray(templateFileCfg.spClausesConditionnelles)
      ? templateFileCfg.spClausesConditionnelles as unknown as SpClauseConditionnelle[]
      : [];
    const sp_clauses_rendered = renderClauses(
      clauses,
      suggestionsSpCompletes,
      spReponses,
      donnees as UnknownRecord,
      catalogue,
    );

    // Référence proposition → variable Word {{sp_reference}}
    // Loyer évalué sur l'état FINAL des réponses (cf. config résumé/réf du template).
    const orgPreferences = (typeof organization?.preferences === 'object' && organization.preferences !== null
      ? organization.preferences
      : {}) as OrganizationPreferences;
    const spConfigLoyer = (templateFileCfg.sp_config_loyer as SpConfigLoyer | undefined)?.baremes
      ? (templateFileCfg.sp_config_loyer as SpConfigLoyer)
      : undefined;
    const spConfigMoisOfferts = orgPreferences.sp_config_mois_offerts;
    const spConfigResumeRef = templateFileCfg.sp_config_resume_ref as SpConfigResumeRef | undefined;
    const sp_reference = buildSpReference(
      spConfigResumeRef,
      spReponses,
      templateQuestions,
      catalogue,
      donnees as UnknownRecord,
      spConfigLoyer,
      spConfigMoisOfferts,
      spPreferencesProduits,
    );

    // Générer le fichier
    const fileUrl = await generatePropositionFile({
      template,
      donnees,
      organization_id: user.id,
      proposition_id: id,
      suggestions_sp_completes: suggestionsSpCompletes,
      sp_clauses_rendered,
      sp_reference,
    });

    // Mettre à jour la proposition avec les bons noms de colonnes
    const { error: updateError } = await supabase
      .from('propositions')
      .update({
        duplicated_template_url: fileUrl,
        statut: 'exported',
        exported_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Note: les crédits sont débités lors de l'extraction (extract/route.ts),
    // pas ici. On ne déduit donc pas une seconde fois au téléchargement/génération.

    return NextResponse.json({ success: true, file_url: fileUrl });
  } catch (error) {
    console.error('Error generating proposition:', error);
    
    // Marquer la proposition en erreur
    const { id } = await params;
    const supabase = await createClient();
    await supabase
      .from('propositions')
      .update({ statut: 'error' })
      .eq('id', id);

    return NextResponse.json(
      {
        error: 'Failed to generate proposition',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
