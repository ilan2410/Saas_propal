import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  CatalogueProduit,
  OrganizationPreferences,
  SpConfigLoyer,
  SpCustomization,
  SpQuestion,
  SpQuestionReponse,
  SpPreferencesProduits,
  SuggestionsSpCompletes,
} from '@/types';
import { generateComparatifSaSpExcel } from '@/lib/excel/comparatif-sa-sp-generator';
import { generateComparatifSaSpWord } from '@/lib/word/comparatif-sa-sp-generator';
import { calculateCartSummary } from '@/lib/sp/calculateCart';
import { buildExportSaSpData } from '@/lib/sp/buildExportSaSpData';

type RouteParams = { params: Promise<{ id: string }> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get('format') ?? 'excel';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Récupérer la proposition (avec sp_reponses, extracted_data, filled_data)
  const { data: proposition, error } = await supabase
    .from('propositions')
    .select(`
      template_id,
      nom_client,
      extracted_data,
      filled_data,
      suggestions_sp_completes,
      sp_reponses,
      organization_id,
      organizations(nom, preferences, logo_url, pdf_header_logo_url, sp_questions)
    `)
    .eq('id', id)
    .eq('organization_id', user.id)
    .single();

  if (error || !proposition) {
    return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
  }

  const orgRaw = (proposition as unknown as { organizations: unknown }).organizations;
  const org = isRecord(orgRaw)
    ? orgRaw
    : Array.isArray(orgRaw) && orgRaw.length > 0
      ? (orgRaw[0] as Record<string, unknown>)
      : null;

  const prefs = (isRecord(org?.preferences) ? org.preferences : {}) as OrganizationPreferences;
  const spCustom = (isRecord(prefs.sp_customization) ? prefs.sp_customization : {}) as SpCustomization;
  const companyName = (typeof spCustom.company_name === 'string' && spCustom.company_name.trim())
    || (typeof org?.nom === 'string' ? org.nom : '')
    || 'Organisation';
  const primaryColor = typeof spCustom.primary_color === 'string' ? spCustom.primary_color : '#0D4073';
  const logoUrl = typeof spCustom.logo_url === 'string'
    ? spCustom.logo_url
    : typeof org?.pdf_header_logo_url === 'string'
      ? org.pdf_header_logo_url
      : typeof org?.logo_url === 'string'
        ? org.logo_url
        : undefined;

  const clientName = (proposition as unknown as { nom_client?: string }).nom_client || 'Client';

  // 2. Construire donneesExtraites (filled_data prioritaire sur extracted_data)
  const extracted = isRecord((proposition as Record<string, unknown>).extracted_data)
    ? ((proposition as Record<string, unknown>).extracted_data as Record<string, unknown>)
    : {};
  const filled = isRecord((proposition as Record<string, unknown>).filled_data)
    ? ((proposition as Record<string, unknown>).filled_data as Record<string, unknown>)
    : {};
  const donneesExtraites: Record<string, unknown> = { ...extracted, ...filled };

  // 3. Récupérer les questions SP de l'organisation, filtrées par template
  const allQuestions = Array.isArray(org?.sp_questions) ? (org!.sp_questions as SpQuestion[]) : [];
  const templateId = (proposition as Record<string, unknown>).template_id;
  const questions: SpQuestion[] = templateId
    ? allQuestions.filter((q) => q.template_id === templateId)
    : allQuestions;

  // 4. Récupérer le catalogue (org + globaux)
  const { data: catalogueRows } = await supabase
    .from('catalogues_produits')
    .select('*')
    .eq('actif', true)
    .or(`organization_id.eq.${user.id},organization_id.is.null`);
  const catalogue: CatalogueProduit[] = Array.isArray(catalogueRows)
    ? (catalogueRows as CatalogueProduit[])
    : [];

  // 5. Réponses SP (peuvent être absentes pour d'anciennes propositions)
  const reponses: SpQuestionReponse[] = Array.isArray((proposition as Record<string, unknown>).sp_reponses)
    ? ((proposition as Record<string, unknown>).sp_reponses as SpQuestionReponse[])
    : [];

  // 6. Récupérer la config loyer (depuis preferences ou template file_config)
  let spConfigLoyer: SpConfigLoyer | undefined;
  let templateFileCfg: Record<string, unknown> = {};
  if (isRecord(prefs.sp_config_loyer)) {
    spConfigLoyer = prefs.sp_config_loyer as unknown as SpConfigLoyer;
  }
  if (typeof templateId === 'string') {
    const { data: tmpl } = await supabase
      .from('proposition_templates')
      .select('file_config')
      .eq('id', templateId)
      .single();
    templateFileCfg = isRecord(tmpl?.file_config) ? (tmpl.file_config as Record<string, unknown>) : {};
    if (!spConfigLoyer && isRecord(templateFileCfg.sp_config_loyer)) {
      spConfigLoyer = templateFileCfg.sp_config_loyer as unknown as SpConfigLoyer;
    }
  }

  // 7. Calculer le panier SP en temps réel
  const spPreferencesProduits = isRecord(templateFileCfg.sp_preferences_produits) ? (templateFileCfg.sp_preferences_produits as unknown as SpPreferencesProduits) : undefined;
  const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, spConfigLoyer, undefined, spPreferencesProduits);
  const storedSpCompletes = (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
  const storedIndemnites = storedSpCompletes?.sp_indemnites_calcul?.montant_retenu;
  if (typeof storedIndemnites === 'number' && Number.isFinite(storedIndemnites)) {
    cart.indemnites = storedIndemnites;
  }

  // 8. Construire les données d'export
  const exportData = buildExportSaSpData({
    cart,
    questions,
    reponses,
    catalogue,
    donneesExtraites,
    companyName,
    primaryColor,
    logoUrl,
  });

  // Si le client a renseigné nom_client mais pas raison_sociale extraite → fallback
  if (!exportData.clientRaisonSociale && clientName !== 'Client') {
    exportData.clientRaisonSociale = clientName;
  }

  // Nom de fichier basé sur la raison sociale du client (comme les propositions)
  const fileClientName = (exportData.clientRaisonSociale && exportData.clientRaisonSociale.trim())
    || clientName;
  const safeClient = fileClientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // enlever les accents
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'Client';

  try {
    if (format === 'word') {
      const buf = await generateComparatifSaSpWord(exportData);
      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/msword',
          'Content-Disposition': `attachment; filename="comparatif-sa-sp-${safeClient}.doc"`,
          'Content-Length': buf.length.toString(),
        },
      });
    }

    const buf = await generateComparatifSaSpExcel(exportData);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="comparatif-sa-sp-${safeClient}.xlsx"`,
        'Content-Length': buf.length.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Erreur génération export', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
