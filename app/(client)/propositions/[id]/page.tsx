import { CLIENT_TEMPLATE_COLUMNS } from '@/lib/security/client-data';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileText,
  Calendar,
  Clock,
  Edit3,
  ChevronDown,
  Sparkles,
  ClipboardList,
  UserRound,
  Headphones,
  Paperclip,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { SuggestionsPanel } from '@/components/propositions/PropositionDetailClient';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { PropositionRowMenu } from '@/components/propositions/PropositionRowMenu';
import { PropositionStatusBadge } from '@/components/propositions/PropositionStatusBadge';
import { StatutCommercialSelect } from '@/components/propositions/StatutCommercialSelect';
import { ExportSaSpButtons } from '@/components/propositions/ExportSaSpButtons';
import { SaResumeRenderer } from '@/components/propositions/SaResumeRenderer';
import { EditableSpResumePanel } from '@/components/propositions/EditableSpResumePanel';
import type {
  CatalogueProduit,
  OrganizationPreferences,
  SpCategorie,
  SpConfigLoyer,
  SpConfigModeDirect,
  SpConfigRemises,
  SpLibellesConfig,
  SpPreferencesProduits,
  SpQuestion,
  SpQuestionReponse,
  SpRegleRemise,
  SpTableProductOrders,
  SuggestionsSpCompletes,
} from '@/types';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { canAccessSecteur, resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { resolvePropositionClientName } from '@/lib/propositions/clientName';
import { EditableClientName } from '@/components/propositions/EditableClientName';
import { TeleprospecteurSelect } from '@/components/propositions/TeleprospecteurSelect';
import { PropositionAttachmentsPanel } from '@/components/propositions/PropositionAttachments';
import { syncSourceDocumentsAsAttachments } from '@/lib/propositions/source-documents';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasSuggestionsGenerees(
  value: unknown
): value is { suggestions: unknown[]; synthese: Record<string, unknown> } {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.suggestions)) return false;
  if (!isRecord(value.synthese)) return false;
  return true;
}

function hasSuggestionsSpCompletes(value: unknown): value is SuggestionsSpCompletes {
  if (!isRecord(value)) return false;
  return Array.isArray(value.sp_lignes_mobiles)
    || Array.isArray(value.sp_lignes_fixes)
    || Array.isArray(value.sp_internet)
    || Array.isArray(value.sp_materiel)
    || Array.isArray(value.sp_materiel_detail);
}

// Compte le nombre total de champs (récursivement)
function countTotalFields(data: unknown): number {
  if (data === null || data === undefined) return 0;
  if (typeof data !== 'object') return 1;
  if (Array.isArray(data)) return data.length;

  let count = 0;

  for (const value of Object.values(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      count += value.length;
    } else if (typeof value === 'object') {
      count += Object.keys(value as Record<string, unknown>).length;
    } else {
      count += 1;
    }
  }

  return count;
}

export default async function PropositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) {
    redirect('/login');
  }

  const canDownloadProposition = ctx.role === 'owner' || ctx.permissions.download_proposition;
  const canDownloadComparatifSaSp = ctx.role === 'owner' || ctx.permissions.download_comparatif_sa_sp;

  // Récupérer la proposition avec le template
  const { data: proposition, error } = await scopePropositionsQuery(
    supabase
      .from('propositions')
      .select(`
        *,
        template:proposition_templates(${CLIENT_TEMPLATE_COLUMNS})
      `)
      .eq('id', id),
    ctx
  ).single();

  if (error || !proposition) {
    console.error('Erreur récupération proposition:', error);
    notFound();
  }

  const templateRaw = (proposition as Record<string, unknown>).template;
  const template = isRecord(templateRaw) ? templateRaw : null;
  if (template && typeof template.secteur === 'string' && !canAccessSecteur(ctx, template.secteur)) {
    notFound();
  }

  const extractedDataRaw = proposition.extracted_data || proposition.donnees_extraites || {};
  const extractedDataRecord: Record<string, unknown> = isRecord(extractedDataRaw) ? extractedDataRaw : {};
  const normalizeKey = (k: string) =>
    k
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  const resumeKey = Object.keys(extractedDataRecord).find((k) => normalizeKey(k) === 'resume');
  const resume =
    resumeKey && typeof extractedDataRecord[resumeKey] === 'string'
      ? (extractedDataRecord[resumeKey] as string)
      : '';
  const extractedDataForDisplay: Record<string, unknown> =
    resumeKey
      ? Object.fromEntries(Object.entries(extractedDataRecord).filter(([k]) => normalizeKey(k) !== 'resume'))
      : extractedDataRecord;
  const clientName = resolvePropositionClientName(
    extractedDataRecord,
    proposition.nom_client,
    'Proposition sans nom',
  );

  const documentsUrls = proposition.source_documents || proposition.documents_urls || proposition.documents_sources_urls || [];

  // Les documents source de l'extraction sont exposés comme pièces jointes :
  // la synchronisation est lazy (à la lecture de la fiche) pour couvrir aussi
  // les propositions créées avant l'introduction des pièces jointes.
  try {
    await syncSourceDocumentsAsAttachments(serviceSupabase, {
      organizationId: ctx.organizationId,
      propositionId: proposition.id,
      urls: documentsUrls,
      uploadedBy: typeof proposition.created_by === 'string' ? proposition.created_by : null,
    });
  } catch (syncError) {
    console.error('Erreur sync pièces jointes (documents source):', syncError);
  }
  const totalFields = countTotalFields(extractedDataForDisplay);
  const suggestionsGenerees =
    (proposition as Record<string, unknown>).suggestions_editees ||
    (proposition as Record<string, unknown>).suggestions_generees;
  const suggestionsSpCompletesRaw = (proposition as Record<string, unknown>).suggestions_sp_completes;
  const suggestionsSpCompletes = hasSuggestionsSpCompletes(suggestionsSpCompletesRaw) ? suggestionsSpCompletesRaw : null;
  const spReponses = Array.isArray((proposition as Record<string, unknown>).sp_reponses)
    ? (proposition as Record<string, unknown>).sp_reponses as SpQuestionReponse[]
    : [];
  const creatorId = typeof proposition.created_by === 'string' ? proposition.created_by : null;
  const [organizationResult, teleprosResult, creatorResult] = await Promise.all([
    createServiceClient().from('organizations')
      .select('sp_questions, preferences, contact_prenom, contact_nom')
      .eq('id', ctx.organizationId)
      .single(),
    serviceSupabase
      .from('teleprospecteurs')
      .select('id, prenom, nom, actif')
      .eq('organization_id', ctx.organizationId)
      .order('nom')
      .order('prenom'),
    creatorId && creatorId !== ctx.organizationId
      ? serviceSupabase
          .from('organization_members')
          .select('prenom, nom')
          .eq('organization_id', ctx.organizationId)
          .eq('user_id', creatorId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const organization = organizationResult.data;
  const teleproOptions = (teleprosResult.data ?? []).map((telepro) => ({
    id: telepro.id,
    name: `${telepro.prenom ?? ''} ${telepro.nom ?? ''}`.trim() || 'Télépro',
    actif: telepro.actif !== false,
  }));
  const creatorName = creatorId === ctx.organizationId
    ? `${organization?.contact_prenom ?? ''} ${organization?.contact_nom ?? ''}`.trim() || 'Compte principal'
    : creatorResult.data
      ? `${creatorResult.data.prenom ?? ''} ${creatorResult.data.nom ?? ''}`.trim() || 'Commercial'
      : 'Non renseigné';
  const allSpQuestions = Array.isArray(organization?.sp_questions) ? organization.sp_questions as SpQuestion[] : [];
  const templateId = typeof proposition.template_id === 'string' ? proposition.template_id : undefined;
  const spQuestions = templateId
    ? allSpQuestions.filter((question) => question.template_id === templateId)
    : allSpQuestions;

  const spObjectifsConfig = Array.isArray((organization?.preferences as Record<string, unknown>)?.sp_objectifs_config)
    ? (organization!.preferences as Record<string, unknown>).sp_objectifs_config as import('@/types').SpObjectifConfig[]
    : [];

  // Données complètes pour le calcul et l'édition (fusion extracted_data + filled_data)
  const filledDataRecord: Record<string, unknown> = isRecord((proposition as Record<string, unknown>).filled_data)
    ? ((proposition as Record<string, unknown>).filled_data as Record<string, unknown>)
    : {};
  const donneesExtraitesForCalc: Record<string, unknown> = {
    ...extractedDataRecord,
    ...filledDataRecord,
  };
  const saTotalMensuel = calculateSaCartSummary(donneesExtraitesForCalc).totalMensuel;

  const prefs = (isRecord(organization?.preferences) ? organization.preferences : {}) as OrganizationPreferences;
  const templateFileCfg = isRecord(template?.file_config) ? (template.file_config as Record<string, unknown>) : {};
  const spConfigLoyer: SpConfigLoyer | undefined = isRecord(templateFileCfg.sp_config_loyer)
    ? (templateFileCfg.sp_config_loyer as unknown as SpConfigLoyer)
    : isRecord(prefs.sp_config_loyer)
      ? prefs.sp_config_loyer
      : undefined;
  const spLibelles: SpLibellesConfig | undefined = isRecord(templateFileCfg.sp_libelles)
    ? (templateFileCfg.sp_libelles as SpLibellesConfig)
    : undefined;
  const spPreferencesProduits: SpPreferencesProduits | undefined = isRecord(templateFileCfg.sp_preferences_produits)
    ? (templateFileCfg.sp_preferences_produits as unknown as SpPreferencesProduits)
    : undefined;
  const spConfigMoisOfferts = isRecord(prefs.sp_config_mois_offerts) ? prefs.sp_config_mois_offerts : undefined;
  const spCategoriesOrder = Array.isArray(prefs.sp_categories_order) ? (prefs.sp_categories_order as SpCategorie[]) : undefined;
  const spTableProductOrders = isRecord(templateFileCfg.sp_table_product_orders)
    ? (templateFileCfg.sp_table_product_orders as SpTableProductOrders)
    : undefined;
  const spConfigRemises: SpConfigRemises | undefined = isRecord(templateFileCfg.sp_config_remises)
    ? (templateFileCfg.sp_config_remises as unknown as SpConfigRemises)
    : undefined;
  const discountRules: SpRegleRemise[] = Array.isArray(prefs.sp_regles_remise)
    ? (prefs.sp_regles_remise as SpRegleRemise[])
    : [];
  const spConfigModeDirect: SpConfigModeDirect | undefined = isRecord(templateFileCfg.sp_config_mode_direct)
    ? (templateFileCfg.sp_config_mode_direct as unknown as SpConfigModeDirect)
    : undefined;
  const isModeDirect = spConfigModeDirect?.actif === true;
  const hasGeneratedFile = Boolean(proposition.duplicated_template_url || proposition.fichier_genere_url);
  const showSpResumeSection = Boolean(suggestionsSpCompletes || spReponses.length > 0 || isModeDirect);

  let catalogue: CatalogueProduit[] = [];
  if (showSpResumeSection) {
    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .eq('organization_id', ctx.organizationId);
    catalogue = Array.isArray(catalogueRows)
      ? (catalogueRows as CatalogueProduit[]).filter((p) => p.secteur_catalogue === (template?.secteur ?? 'telephonie'))
      : [];
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div data-proposition-detail-header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <Link
            href="/propositions"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux propositions
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg font-semibold text-slate-600">
                {clientName[0]?.toUpperCase() || 'C'}
              </div>
              <div className="min-w-0">
                <h1 className="flex min-w-0 text-xl font-semibold text-slate-900">
                  <EditableClientName propositionId={proposition.id} value={clientName} className="min-w-0" />
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <PropositionStatusBadge statut={proposition.statut} />
                  {proposition.statut === 'exported' && (
                    <StatutCommercialSelect
                      propositionId={proposition.id}
                      value={proposition.statut_commercial}
                    />
                  )}
                  <span className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Créée le {formatDate(proposition.created_at, 'long')}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    Modifiée le {formatDate(proposition.updated_at || proposition.created_at, 'full')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {typeof template?.nom === 'string' ? template.nom : 'Template N/A'}
                  {' · '}
                  {documentsUrls.length} document{documentsUrls.length > 1 ? 's' : ''}
                  {' · '}
                  {totalFields} champ{totalFields > 1 ? 's' : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <UserRound className="h-3.5 w-3.5" />
                    {creatorName}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Headphones className="h-3.5 w-3.5" />
                    <TeleprospecteurSelect
                      propositionId={proposition.id}
                      value={typeof proposition.teleprospecteur_id === 'string' ? proposition.teleprospecteur_id : null}
                      options={teleproOptions}
                      canCreate={ctx.role === 'owner'}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
              {['draft', 'ready', 'extracted'].includes(proposition.statut) && !isModeDirect && (
                <Link
                  href={`/propositions/${proposition.id}/resume`}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  <Edit3 className="h-4 w-4" />
                  Reprendre
                </Link>
              )}

              {canDownloadProposition &&
                ['draft', 'ready', 'extracted'].includes(proposition.statut) &&
                !hasGeneratedFile && (
                  <GenerateButton propositionId={proposition.id} variant="primary" />
                )}

              {canDownloadProposition && hasGeneratedFile && (
                <GenerateButton
                  propositionId={proposition.id}
                  variant="primary"
                  label="Télécharger"
                  icon={<Download className="h-4 w-4" />}
                />
              )}

              {canDownloadComparatifSaSp && (proposition.suggestions_sp_completes || isModeDirect) && (
                <ExportSaSpButtons propositionId={proposition.id} variant="outline" />
              )}

              <PropositionRowMenu
                propositionId={proposition.id}
                showOpenDetail={false}
                afterDeleteHref="/propositions"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {/* Timeline / Progress (si génération en cours) */}
        {proposition.statut === 'processing' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 animate-spin text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">Génération en cours…</h3>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-3/5 animate-pulse rounded-full bg-slate-900" />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Votre proposition est en cours de création. Cela peut prendre quelques instants.
            </p>
          </div>
        )}

        {/* Résumé SA */}
        {!!resume.trim() && (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Résumé SA</h2>
                  <p className="text-xs text-slate-500">
                    Synthèse automatique basée sur les documents sources
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-5">
              <SaResumeRenderer text={resume} donneesExtraites={donneesExtraitesForCalc} />
            </div>
          </details>
        )}

        {/* Suggestions IA */}
        {hasSuggestionsGenerees(suggestionsGenerees) && (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Suggestions IA</h2>
                  <p className="text-xs text-slate-500">
                    Comparatif calculé à partir des données de la proposition
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-5">
              <SuggestionsPanel
                propositionId={proposition.id}
                clientName={clientName}
                suggestions={suggestionsGenerees}
                embedded
              />
            </div>
          </details>
        )}

        {/* Résumé SP */}
        {showSpResumeSection && (
          <details open={isModeDirect || !hasGeneratedFile} className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <ClipboardList className="h-4 w-4 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Résumé SP</h2>
                  <p className="text-xs text-slate-500">
                    {isModeDirect
                      ? 'Synthèse de la situation proposée et du panier SP'
                      : 'Synthèse de la situation proposée, du panier SP et des réponses au questionnaire'}
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-5">
              <EditableSpResumePanel
                propositionId={proposition.id}
                initialSp={suggestionsSpCompletes}
                initialReponses={spReponses}
                questions={spQuestions}
                catalogue={catalogue}
                initialDonneesExtraites={donneesExtraitesForCalc}
                saTotalMensuel={saTotalMensuel}
                spConfigLoyer={spConfigLoyer}
                spConfigMoisOfferts={spConfigMoisOfferts}
                spPreferencesProduits={spPreferencesProduits}
                spConfigRemises={spConfigRemises}
                discountRules={discountRules}
                spConfigModeDirect={spConfigModeDirect}
                spLibelles={spLibelles}
                spCategoriesOrder={spCategoriesOrder}
                spTableProductOrders={spTableProductOrders}
                spObjectifsConfig={spObjectifsConfig}
                templateId={templateId ?? ''}
              />
            </div>
          </details>
        )}

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <Paperclip className="h-4 w-4 text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Pièces jointes</h2>
              <p className="text-xs text-slate-500">Factures, contrats signés et documents de suivi</p>
            </div>
          </div>
          <div className="p-5">
            <PropositionAttachmentsPanel propositionId={proposition.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
