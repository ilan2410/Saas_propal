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

  const stepParam = resolvedSearchParams?.step;
  const stepRaw = Array.isArray(stepParam) ? stepParam[0] : stepParam;
  const stepFromQuery = stepRaw ? Number(stepRaw) : NaN;
  const initialStep = Math.max(
    1,
    Math.min(5, Number.isFinite(stepFromQuery) ? stepFromQuery : Number(proposition.current_step || 1))
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
        }}
      />
    </div>
  );
}
