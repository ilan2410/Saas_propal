import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PropositionWizard } from '@/components/propositions/PropositionWizard';

export default async function ResumePropositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('secteur')
    .eq('id', user.id)
    .single();

  const secteur = organization?.secteur || 'telephonie';

  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('organization_id', user.id)
    .eq('statut', 'actif')
    .order('created_at', { ascending: false });

  if (!templates || templates.length === 0) {
    redirect('/propositions/new');
  }

  const { data: proposition, error } = await supabase
    .from('propositions')
    .select('*')
    .eq('id', id)
    .eq('organization_id', user.id)
    .single();

  if (error || !proposition) {
    notFound();
  }

  const sourceDocuments = proposition.source_documents;
  const documents_urls = Array.isArray(sourceDocuments)
    ? sourceDocuments.filter((url): url is string => typeof url === 'string')
    : [];

  const dataRaw = proposition.filled_data ?? proposition.extracted_data ?? {};
  const dataToEdit: Record<string, unknown> =
    dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw) ? (dataRaw as Record<string, unknown>) : {};

  // Déduire l'étape à partir des données réellement disponibles en base
  // (plus fiable que current_step seul, qui peut ne pas refléter l'état exact)
  const hasExtractedData =
    proposition.extracted_data &&
    typeof proposition.extracted_data === 'object' &&
    !Array.isArray(proposition.extracted_data) &&
    Object.keys(proposition.extracted_data as Record<string, unknown>).length > 0;
  const hasFilledData =
    proposition.filled_data &&
    typeof proposition.filled_data === 'object' &&
    !Array.isArray(proposition.filled_data) &&
    Object.keys(proposition.filled_data as Record<string, unknown>).length > 0;
  const hasSuggestions = !!proposition.suggestions_generees || !!proposition.suggestions_editees;
  const hasDocuments = documents_urls.length > 0;

  let inferredStep = 1;
  if (hasSuggestions) {
    inferredStep = 5;
  } else if (hasExtractedData || hasFilledData) {
    inferredStep = 4;
  } else if (hasDocuments) {
    inferredStep = 3;
  } else if (proposition.template_id) {
    inferredStep = 2;
  }

  const persistedStep = Number(proposition.current_step || 0);
  // On prend le max entre l'étape persistée et l'étape déduite afin de ne jamais
  // renvoyer l'utilisateur en arrière alors que les données sont déjà présentes.
  const baseStep = Math.max(inferredStep, persistedStep || 1);

  const stepParam = resolvedSearchParams?.step;
  const stepRaw = Array.isArray(stepParam) ? stepParam[0] : stepParam;
  const stepFromQuery = stepRaw ? Number(stepRaw) : NaN;
  const initialStep = Math.max(
    1,
    Math.min(5, Number.isFinite(stepFromQuery) ? stepFromQuery : baseStep)
  );

  return (
    <div className="space-y-6">
      <Link
        href="/propositions"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux propositions
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reprendre une proposition</h1>
        <p className="text-gray-600 mt-2">Vous pouvez reprendre là où vous vous êtes arrêté.</p>
      </div>

      <PropositionWizard
        templates={templates}
        secteur={secteur}
        initialStep={initialStep}
        initialData={{
          proposition_id: proposition.id,
          template_id: proposition.template_id || '',
          nom_client: proposition.nom_client || undefined,
          documents_urls,
          donnees_extraites: dataToEdit,
          suggestions_generees: proposition.suggestions_generees || null,
          suggestions_editees: proposition.suggestions_editees || null,
        }}
      />
    </div>
  );
}
