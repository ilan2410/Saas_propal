import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderWordWithImages } from '@/lib/generators/word-image';
import { buildSpWordData } from '@/lib/generators/sp-word-data';
import {
  isPlainObject,
  findValueInData,
  formatValueForWord,
  flattenForDocx,
  setNestedValue,
  buildSaWordData,
  buildEntrepriseWordData,
  type UnknownRecord,
} from '@/lib/generators/word-data-utils';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { renderClauses } from '@/lib/sp/renderClauses';
import { buildSpReference } from '@/lib/sp/buildReference';
import { repairSpCompletesFromQuestionnaire } from '@/lib/sp/repairSpCompletes';
import { normalizePhoneNumber } from '@/lib/utils/formatting';
import type { WordConfig, SpPreferencesProduits, SpClauseConditionnelle, SpConfigLoyer, SpConfigResumeRef, OrganizationPreferences, SpQuestion, SpQuestionReponse, CatalogueProduit, SuggestionsSpCompletes } from '@/types';

/**
 * Génère un aperçu du template Word rempli avec les vraies valeurs (SA + SP)
 * de la dernière proposition du template, sans créer de proposition ni
 * stocker de fichier. Le DOCX rempli est renvoyé en binaire.
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
          { error: 'Impossible de charger le document Word du template' },
          { status: 502 }
        );
      }
      templateBuffer = await response.arrayBuffer();
    } else {
      return NextResponse.json({ error: 'Aucun fichier Word disponible' }, { status: 400 });
    }

    // 3. Récupérer la proposition source.
    //    Priorité : la plus récente proposition AYANT des données SP
    //    (suggestions_sp_completes non nul). À défaut, la plus récente tout
    //    court (les variables SA seront remplies, les tableaux SP resteront vides).
    const baseSelect = 'template_id, extracted_data, filled_data, suggestions_sp_completes, sp_reponses, organizations(nom, email, secteur, siret, adresse, code_postal, ville, telephone_fixe, telephone_mobile, contact_prenom, contact_nom, logo_url, sp_questions, preferences)';

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
    let propositionSource = 'latest_with_sp';

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
      propositionSource = 'latest_any';
    }

    if (!proposition) {
      // Aucune donnée disponible : le client basculera sur l'aperçu brut
      return NextResponse.json({ hasData: false });
    }

    // 4. Préparer les données (réplique de generateWordFile)
    const extracted: UnknownRecord = isPlainObject(proposition.extracted_data)
      ? (proposition.extracted_data as UnknownRecord)
      : {};
    const filled: UnknownRecord = isPlainObject(proposition.filled_data)
      ? (proposition.filled_data as UnknownRecord)
      : {};
    const baseData: UnknownRecord = { ...extracted, ...filled };
    if (isPlainObject(baseData.situation_actuelle)) {
      const situationActuelle = { ...baseData.situation_actuelle };
      const saCart = calculateSaCartSummary({ situation_actuelle: situationActuelle });
      situationActuelle.total_abonnements = Math.round((saCart.lignesFixes + saCart.lignesMobiles + saCart.lignesInternet + saCart.abonnements) * 100) / 100;
      situationActuelle.total_loyer_mensuel = saCart.totalMensuel;
      situationActuelle.total_materiel = saCart.locations;
      baseData.situation_actuelle = situationActuelle;
    }

    const fileConfig = isPlainObject(template.file_config) ? template.file_config : {};
    const mappedData: UnknownRecord = { ...baseData };

    const rawFieldMappings = fileConfig.fieldMappings;
    const fieldMappings: Record<string, string> = {};
    if (isPlainObject(rawFieldMappings)) {
      for (const [k, v] of Object.entries(rawFieldMappings)) {
        if (typeof v === 'string') fieldMappings[k] = v;
      }
    }

    for (const [templateVar, dataKey] of Object.entries(fieldMappings)) {
      const cleanVar = templateVar.replace(/[{}]/g, '').trim();
      if (!cleanVar) continue;

      const value = findValueInData(baseData, dataKey);
      const formatted = formatValueForWord(value);

      if (cleanVar.includes('.')) {
        setNestedValue(mappedData, cleanVar, formatted);
      } else {
        mappedData[cleanVar] = formatted;
      }
    }

    const flatData: UnknownRecord = {};
    flattenForDocx(baseData, flatData);
    if (typeof flatData['client.mobile'] === 'string') {
      flatData['client.mobile'] = normalizePhoneNumber(flatData['client.mobile']);
    }
    if (typeof flatData['client.fixe'] === 'string') {
      flatData['client.fixe'] = normalizePhoneNumber(flatData['client.fixe']);
    }

    const orgRaw = (proposition as Record<string, unknown>).organizations;
    const org = isPlainObject(orgRaw)
      ? orgRaw as UnknownRecord
      : Array.isArray(orgRaw) && orgRaw.length > 0 && isPlainObject(orgRaw[0])
        ? orgRaw[0] as UnknownRecord
        : {};
    const allQuestions = Array.isArray(org.sp_questions) ? org.sp_questions as SpQuestion[] : [];
    const propositionTemplateId = typeof (proposition as Record<string, unknown>).template_id === 'string'
      ? (proposition as Record<string, unknown>).template_id as string
      : template.id;
    const templateQuestions = allQuestions.filter((question) => question.template_id === propositionTemplateId);
    const spReponses = Array.isArray((proposition as Record<string, unknown>).sp_reponses)
      ? (proposition as Record<string, unknown>).sp_reponses as SpQuestionReponse[]
      : [];
    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .or(`organization_id.eq.${user.id},organization_id.is.null`);
    const catalogue = Array.isArray(catalogueRows) ? catalogueRows as CatalogueProduit[] : [];

    const storedSpCompletes = (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
    const spPreferencesProduits = isPlainObject(fileConfig.sp_preferences_produits) ? fileConfig.sp_preferences_produits as unknown as SpPreferencesProduits : undefined;
    // Config loyer / mois offerts : même source que la génération finale, pour garantir
    // des montants identiques entre l'aperçu et le document Word généré.
    const orgPreferences = (isPlainObject(org.preferences) ? org.preferences : {}) as OrganizationPreferences;
    const spConfigLoyer = (fileConfig.sp_config_loyer as SpConfigLoyer | undefined)?.baremes
      ? (fileConfig.sp_config_loyer as SpConfigLoyer)
      : undefined;
    const spConfigMoisOfferts = orgPreferences.sp_config_mois_offerts;
    const spCompletes = repairSpCompletesFromQuestionnaire(storedSpCompletes, spReponses, templateQuestions, catalogue, baseData, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits, orgPreferences.sp_categories_order);
    const wordCfg = fileConfig as unknown as WordConfig;
    const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);
    // Tableaux SA remontés à plat (ex: {{#lignes}}) — priment sur les clés plates SA.
    const saData = buildSaWordData(baseData);
    // Clauses conditionnelles rendues → {{sp_clause_<cle>}} (même logique que la génération).
    const clauses = Array.isArray(wordCfg.spClausesConditionnelles)
      ? wordCfg.spClausesConditionnelles as SpClauseConditionnelle[]
      : [];
    const clausesData = renderClauses(clauses, spCompletes, spReponses, baseData, catalogue);
    // Référence proposition → {{sp_reference}} (même logique que la génération).
    const sp_reference = buildSpReference(
      fileConfig.sp_config_resume_ref as SpConfigResumeRef | undefined,
      spReponses,
      templateQuestions,
      catalogue,
      baseData,
      spConfigLoyer,
      orgPreferences.sp_config_mois_offerts,
      spPreferencesProduits,
    );
    const referenceData: Record<string, string> = { sp_reference: sp_reference ?? '' };
    // Profil Entreprise (organizations) → variables {{entreprise_*}}, distinctes des
    // variables client (SA) et situation proposée (SP).
    const entrepriseData = buildEntrepriseWordData(org);
    // Ordre de priorité : données extraites (flat) < SA < SP calculées < entreprise < clauses < référence < mapping utilisateur.
    // Les clés SP (ex: sp_materiel_detail) doivent écraser les données extraites du document source.
    const finalData = { ...flatData, ...saData, ...spData, ...entrepriseData, ...clausesData, ...referenceData, ...mappedData };

    // 5. Rendre le DOCX rempli en mémoire (images supportées, y compris en boucle).
    let uint8Array: Uint8Array;
    try {
      uint8Array = await renderWordWithImages(templateBuffer, finalData);
    } catch (error) {
      const e = error as {
        message?: string;
        properties?: {
          errors?: Array<{
            name?: string;
            message?: string;
            properties?: {
              id?: string;
              explanation?: string;
              xtag?: string;
              file?: string;
            };
          }>;
        };
      };
      const details = e?.properties?.errors?.map((er) => {
        const explanation = er?.properties?.explanation?.trim();
        if (explanation) return explanation;
        const parts = [
          er?.properties?.id,
          er?.name,
          er?.message,
          er?.properties?.xtag ? `tag=${er.properties.xtag}` : undefined,
          er?.properties?.file ? `file=${er.properties.file}` : undefined,
        ].filter(Boolean);
        return parts.join(' | ');
      }).filter(Boolean).join('\n') ||
        e?.message ||
        'Erreur inconnue';
      return NextResponse.json(
        { error: `Erreur lors du remplissage du document : ${details}` },
        { status: 422 }
      );
    }

    return new NextResponse(Buffer.from(uint8Array), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-Has-Data': '1',
      },
    });
  } catch (error) {
    console.error('Erreur preview-word:', error);
    return NextResponse.json(
      {
        error: 'Échec de la génération de l\'aperçu',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
