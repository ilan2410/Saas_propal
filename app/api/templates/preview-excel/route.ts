import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPropositionBaseData, fillExcelWorkbook } from '@/lib/generators';
import { repairMaterialDetailFromQuestionnaire } from '@/lib/sp/repairMaterialDetail';
import { renderClauses } from '@/lib/sp/renderClauses';
import { buildSpReference } from '@/lib/sp/buildReference';
import type {
  SuggestionsSpCompletes,
  SpQuestion,
  SpQuestionReponse,
  CatalogueProduit,
  SpPreferencesProduits,
  SpClauseConditionnelle,
  SpConfigLoyer,
  SpConfigResumeRef,
  OrganizationPreferences,
} from '@/types';

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Génère un aperçu du template Excel rempli avec les vraies valeurs (SA + SP) de la
 * dernière proposition du template, sans créer de proposition ni stocker de fichier.
 * Le .xlsx rempli est renvoyé en binaire (équivalent Excel de preview-word).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const templateId = formData.get('templateId');
    const uploadedFile = formData.get('file');

    if (typeof templateId !== 'string' || !templateId) {
      return NextResponse.json({ error: 'templateId manquant' }, { status: 400 });
    }

    // 1. Récupérer le template (config + file_url) en vérifiant l'organisation
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select('id, file_url, file_config')
      .eq('id', templateId)
      .eq('organization_id', user.id)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
    }

    // 2. Récupérer le buffer du template (upload en cours, sinon storage)
    let templateBuffer: ArrayBuffer;
    if (uploadedFile && uploadedFile instanceof File) {
      templateBuffer = await uploadedFile.arrayBuffer();
    } else if (template.file_url) {
      const response = await fetch(template.file_url);
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Impossible de charger le fichier Excel du template' },
          { status: 502 }
        );
      }
      templateBuffer = await response.arrayBuffer();
    } else {
      return NextResponse.json({ error: 'Aucun fichier Excel disponible' }, { status: 400 });
    }

    // 3. Récupérer la proposition source : en priorité la plus récente AYANT des
    //    données SP ; à défaut la plus récente tout court (SA uniquement).
    const baseSelect =
      'template_id, extracted_data, filled_data, suggestions_sp_completes, sp_reponses, organizations(sp_questions, preferences)';

    const { data: propWithSp } = await supabase
      .from('propositions')
      .select(baseSelect)
      .eq('organization_id', user.id)
      .eq('template_id', templateId)
      .not('suggestions_sp_completes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let proposition = propWithSp;
    if (!proposition) {
      const { data: latestProp } = await supabase
        .from('propositions')
        .select(baseSelect)
        .eq('organization_id', user.id)
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      proposition = latestProp;
    }

    if (!proposition) {
      // Aucune donnée : le client basculera sur l'aperçu brut
      return NextResponse.json({ hasData: false });
    }

    // 4. Préparer les données (même logique que la route de génération Excel)
    const extracted: UnknownRecord = isPlainObject(proposition.extracted_data)
      ? (proposition.extracted_data as UnknownRecord)
      : {};
    const filled: UnknownRecord = isPlainObject(proposition.filled_data)
      ? (proposition.filled_data as UnknownRecord)
      : {};
    const donnees: UnknownRecord = { ...extracted, ...filled };

    const fileConfig: UnknownRecord = isPlainObject(template.file_config) ? template.file_config : {};

    const orgRaw = (proposition as Record<string, unknown>).organizations;
    const org = isPlainObject(orgRaw)
      ? (orgRaw as UnknownRecord)
      : Array.isArray(orgRaw) && orgRaw.length > 0 && isPlainObject(orgRaw[0])
        ? (orgRaw[0] as UnknownRecord)
        : {};

    const allQuestions = Array.isArray(org.sp_questions) ? (org.sp_questions as SpQuestion[]) : [];
    const propositionTemplateId =
      typeof (proposition as Record<string, unknown>).template_id === 'string'
        ? ((proposition as Record<string, unknown>).template_id as string)
        : template.id;
    const templateQuestions = allQuestions.filter((q) => q.template_id === propositionTemplateId);
    const spReponses = Array.isArray(proposition.sp_reponses)
      ? (proposition.sp_reponses as SpQuestionReponse[])
      : [];

    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .or(`organization_id.eq.${user.id},organization_id.is.null`);
    const catalogue = Array.isArray(catalogueRows) ? (catalogueRows as CatalogueProduit[]) : [];

    const spPreferencesProduits = isPlainObject(fileConfig.sp_preferences_produits)
      ? (fileConfig.sp_preferences_produits as unknown as SpPreferencesProduits)
      : undefined;

    const spCompletes = repairMaterialDetailFromQuestionnaire(
      (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null,
      spReponses,
      templateQuestions,
      catalogue,
      donnees,
      spPreferencesProduits,
    );

    // Clauses conditionnelles → variables sp_clause_<cle>
    const clauses = Array.isArray(fileConfig.spClausesConditionnelles)
      ? (fileConfig.spClausesConditionnelles as unknown as SpClauseConditionnelle[])
      : [];
    const sp_clauses_rendered = renderClauses(clauses, spCompletes, spReponses, donnees, catalogue);

    // Référence proposition → sp_reference
    const orgPreferences = (isPlainObject(org.preferences) ? org.preferences : {}) as OrganizationPreferences;
    const spConfigLoyer = (fileConfig.sp_config_loyer as SpConfigLoyer | undefined)?.baremes
      ? (fileConfig.sp_config_loyer as SpConfigLoyer)
      : undefined;
    const sp_reference = buildSpReference(
      fileConfig.sp_config_resume_ref as SpConfigResumeRef | undefined,
      spReponses,
      templateQuestions,
      catalogue,
      donnees,
      spConfigLoyer,
      orgPreferences.sp_config_mois_offerts,
      spPreferencesProduits,
    );

    // 5. Construire le dictionnaire complet puis remplir le classeur (= fichier généré)
    const baseData = buildPropositionBaseData({
      template: {
        id: template.id,
        file_type: 'excel',
        file_url: template.file_url ?? '',
        file_config: fileConfig,
        champs_actifs: [],
      },
      donnees,
      organization_id: user.id,
      proposition_id: '',
      suggestions_sp_completes: spCompletes,
      sp_clauses_rendered,
      sp_reference,
    });

    let uint8Array: Uint8Array;
    try {
      uint8Array = await fillExcelWorkbook(templateBuffer, donnees, baseData, fileConfig);
    } catch (error) {
      return NextResponse.json(
        { error: `Erreur lors du remplissage du fichier Excel : ${error instanceof Error ? error.message : 'Erreur inconnue'}` },
        { status: 422 }
      );
    }

    return new NextResponse(Buffer.from(uint8Array), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'X-Has-Data': '1',
      },
    });
  } catch (error) {
    console.error('Erreur preview-excel:', error);
    return NextResponse.json(
      {
        error: 'Échec de la génération de l\'aperçu Excel',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
