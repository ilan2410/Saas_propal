import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, CreditCard, FileText, BarChart, Plus, Settings, Eye } from 'lucide-react';
import {
  formatCurrency,
  formatDate,
  formatSecteur,
} from '@/lib/utils/formatting';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Utiliser le client admin avec service_role_key pour bypasser les RLS
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Récupérer l'organization
  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !org) {
    notFound();
  }

  // Récupérer les templates
  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('organization_id', id);

  // Récupérer les propositions
  const { data: propositions } = await supabase
    .from('propositions')
    .select('*')
    .eq('organization_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Récupérer les transactions
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('*')
    .eq('organization_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux clients
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{org.nom}</h1>
            <p className="text-gray-600 mt-2">{org.email}</p>
          </div>
          <Link
            href={`/admin/clients/${id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Modifier
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Crédits</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(org.credits || 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Templates</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {templates?.length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Propositions</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {propositions?.length || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tarif/Prop</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(org.tarif_par_proposition)}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <BarChart className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Informations */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Informations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <dt className="text-sm text-gray-600">Secteur</dt>
            <dd className="text-sm font-medium text-gray-900 mt-1">
              {formatSecteur(org.secteur)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Date de création</dt>
            <dd className="text-sm font-medium text-gray-900 mt-1">
              {formatDate(org.created_at, 'long')}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Dernière mise à jour</dt>
            <dd className="text-sm font-medium text-gray-900 mt-1">
              {formatDate(org.updated_at, 'long')}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Email</dt>
            <dd className="text-sm font-medium text-gray-900 mt-1">
              {org.email}
            </dd>
          </div>
        </div>
      </div>

      {/* Templates */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Templates</h2>
            <p className="text-sm text-gray-600 mt-1">
              Chaque template contient sa propre configuration IA et champs à extraire
            </p>
          </div>
          <Link
            href={`/admin/clients/${id}/templates/new`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Nouveau template
          </Link>
        </div>
        <div className="p-6">
          {templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => {
                const t = template as { id: string } & Record<string, unknown>;
                return (
                <div
                  key={t.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <FileText className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{String(t.nom ?? '')}</h3>
                        <p className="text-xs text-gray-500">
                          {Array.isArray(t.champs_actifs) ? t.champs_actifs.length : 0} champs configurés
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {typeof t.type_fichier === 'string' ? t.type_fichier.toUpperCase() : 'EXCEL'}
                    </span>
                    <span>
                      Créé le {formatDate(String(t.created_at ?? ''))}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/clients/${id}/templates/${t.id}`}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Voir
                    </Link>
                    <Link
                      href={`/admin/clients/${id}/templates/${t.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Configurer
                    </Link>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun template</h3>
              <p className="text-gray-500 mb-4">
                Créez un template pour configurer l&apos;extraction IA
              </p>
              <Link
                href={`/admin/clients/${id}/templates/new`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Créer un template
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Propositions récentes */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Propositions récentes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Nom
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {propositions?.map((prop) => (
                <tr key={prop.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {prop.nom_client || 'Sans nom'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        prop.statut === 'exported'
                          ? 'bg-green-100 text-green-800'
                          : prop.statut === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {prop.statut}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(prop.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Transactions récentes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Montant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Crédits
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions?.map((trans) => (
                <tr key={trans.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(trans.montant)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    +{formatCurrency(trans.credits_ajoutes)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        trans.statut === 'succeeded'
                          ? 'bg-green-100 text-green-800'
                          : trans.statut === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {trans.statut}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(trans.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
