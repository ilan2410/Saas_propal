import { createClient, createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, FileText, Sparkles } from 'lucide-react';
import { purgeOldSourceDocuments } from '@/lib/propositions/cleanup';
import { resolvePropositionClientName } from '@/lib/propositions/clientName';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { isStatutCommercial } from '@/lib/propositions/status';
import {
  PropositionsListClient,
  type PropositionCounts,
  type PropositionListItem,
} from '@/components/propositions/PropositionsListClient';

export const revalidate = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Compte les champs extraits
function countFields(data: unknown): number {
  if (!isRecord(data) && !Array.isArray(data)) return 0;
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

export default async function PropositionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctx = user ? await resolveOrgContext(supabase, user) : null;

  if (ctx) {
    const serviceSupabase = createServiceClient();
    await purgeOldSourceDocuments(serviceSupabase, ctx.organizationId, 15);
  }

  // Récupérer toutes les propositions avec les templates
  const propositionsQuery = supabase
    .from('propositions')
    .select(`
      *,
      template:proposition_templates(nom),
      proposition_notes(count)
    `);
  const propositionsResult = ctx
    ? await scopePropositionsQuery(propositionsQuery, ctx).order('created_at', { ascending: false })
    : await propositionsQuery.eq('organization_id', '').order('created_at', { ascending: false });

  let propositions = propositionsResult.data;
  if (
    propositionsResult.error
    && (propositionsResult.error.code === 'PGRST200' || propositionsResult.error.message.includes('proposition_notes'))
  ) {
    const fallbackQuery = supabase
      .from('propositions')
      .select(`
        *,
        template:proposition_templates(nom)
      `);
    const fallbackResult = ctx
      ? await scopePropositionsQuery(fallbackQuery, ctx).order('created_at', { ascending: false })
      : await fallbackQuery.eq('organization_id', '').order('created_at', { ascending: false });
    if (fallbackResult.error) throw fallbackResult.error;
    propositions = fallbackResult.data;
  } else if (propositionsResult.error) {
    throw propositionsResult.error;
  }

  const displayedPropositions = (propositions || []).filter((p) => {
    const prop = p as Record<string, unknown>;
    const statut = typeof prop.statut === 'string' ? prop.statut : '';
    const templateId = typeof prop.template_id === 'string' ? prop.template_id : null;
    const nomClient = typeof prop.nom_client === 'string' ? prop.nom_client : null;
    const currentStep = typeof prop.current_step === 'number' ? prop.current_step : null;
    const sourceDocuments = prop.source_documents;
    const hasDocs =
      Array.isArray(sourceDocuments) && sourceDocuments.some((v) => typeof v === 'string' && v.trim());
    const hasAnyData = Boolean(prop.extracted_data) || Boolean(prop.donnees_extraites) || Boolean(prop.filled_data);

    const isEmptyDraft =
      statut === 'draft' &&
      !templateId &&
      !nomClient &&
      !hasDocs &&
      !hasAnyData &&
      (currentStep === null || currentStep === 1);

    return !isEmptyDraft;
  });

  // Préparation des données sérialisables pour le composant client
  const listItems: PropositionListItem[] = displayedPropositions.map((prop) => ({
    id: prop.id,
    statut: typeof prop.statut === 'string' ? prop.statut : '',
    statutCommercial: isStatutCommercial(prop.statut_commercial)
      ? prop.statut_commercial
      : 'en_cours',
    templateNom:
      (isRecord(prop.template) && typeof prop.template.nom === 'string'
        ? prop.template.nom
        : '') || '',
    clientName: resolvePropositionClientName(
      prop.extracted_data || prop.donnees_extraites,
      prop.nom_client,
    ),
    fieldsCount: countFields(prop.extracted_data || prop.donnees_extraites),
    notesCount: Array.isArray(prop.proposition_notes)
      ? Number(prop.proposition_notes[0]?.count ?? 0)
      : 0,
    createdAt: prop.created_at,
  }));

  // Compteurs pour les filtres (pills). « Brouillons » = pas encore exportée ;
  // les autres se basent sur le statut commercial des propositions exportées.
  const counts: PropositionCounts = {
    toutes: listItems.length,
    brouillons: listItems.filter((p) => p.statut !== 'exported').length,
    en_cours: listItems.filter((p) => p.statut === 'exported' && p.statutCommercial === 'en_cours').length,
    en_attente_client: listItems.filter((p) => p.statut === 'exported' && p.statutCommercial === 'en_attente_client').length,
    signee: listItems.filter((p) => p.statut === 'exported' && p.statutCommercial === 'signee').length,
    perdue: listItems.filter((p) => p.statut === 'exported' && p.statutCommercial === 'perdue').length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Propositions</h1>
            <p className="text-sm text-slate-500 mt-1">
              Suivez et statuez vos propositions commerciales
            </p>
          </div>
          <Link
            href="/propositions/new"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 w-fit"
          >
            <Plus className="h-4 w-4" />
            Nouvelle proposition
          </Link>
        </div>

        {/* Liste des propositions */}
        {displayedPropositions.length > 0 ? (
          <PropositionsListClient propositions={listItems} counts={counts} />
        ) : (
          /* Empty State */
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-16 text-center">
            <div className="mx-auto max-w-md">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                <FileText className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Aucune proposition pour le moment
              </h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Créez votre première proposition commerciale automatiquement à partir
                d&apos;un template et de vos documents
              </p>
              <Link
                href="/propositions/new"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
                Créer ma première proposition
                <Sparkles className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
