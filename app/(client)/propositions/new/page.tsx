import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PropositionWizard } from '@/components/propositions/PropositionWizard';

export default async function NewPropositionPage() {
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

  // Récupérer les templates actifs
  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('organization_id', user.id)
    .eq('statut', 'actif')
    .order('created_at', { ascending: false });

  // Vérifier qu'il y a au moins un template
  if (!templates || templates.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/propositions"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux propositions
        </Link>

        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">📄</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucun template actif
          </h3>
          <p className="text-gray-500 mb-6">
            Vous devez d&apos;abord créer et activer un template
          </p>
          <Link
            href="/templates/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Créer un template
          </Link>
        </div>
      </div>
    );
  }

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
        <h1 className="text-3xl font-bold text-gray-900">
          Nouvelle Proposition
        </h1>
        <p className="text-gray-600 mt-2">
          Générez une proposition à partir d&apos;un template
        </p>
      </div>

      <PropositionWizard templates={templates} secteur={secteur} />
    </div>
  );
}
