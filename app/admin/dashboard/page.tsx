import { createClient as createServiceClient } from '@supabase/supabase-js';
import { Users, FileText, TrendingUp, DollarSign, CreditCard, BarChart3 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/formatting';

export const revalidate = 0;

export default async function AdminDashboard() {
  // Utiliser le client admin
  const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Récupérer les statistiques globales
  const { data: organizations } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: allPropositions } = await supabaseAdmin
    .from('propositions')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: transactions } = await supabaseAdmin
    .from('stripe_transactions')
    .select('*')
    .order('created_at', { ascending: false});

  // Calculer les statistiques
  const totalClients = organizations?.length || 0;
  const totalPropositions = allPropositions?.length || 0;
  const totalCredits = organizations?.reduce((sum, org) => sum + (org.credits || 0), 0) || 0;
  const totalRevenue = transactions?.filter((t) => t.statut === 'succeeded')
    .reduce((sum, t) => sum + (t.montant || 0), 0) || 0;
  const propositionsExportees = allPropositions?.filter((p) => p.statut === 'exported').length || 0;
  
  // Stats du mois en cours
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const clientsCeMois = organizations?.filter(
    (o) => new Date(o.created_at) >= startOfMonth
  ).length || 0;
  const propositionsCeMois = allPropositions?.filter(
    (p) => new Date(p.created_at) >= startOfMonth
  ).length || 0;
  const revenueCeMois = transactions?.filter(
    (t) => t.statut === 'succeeded' && new Date(t.created_at) >= startOfMonth
  ).reduce((sum, t) => sum + (t.montant || 0), 0) || 0;

  // Clients récents
  const recentClients = organizations?.slice(0, 5) || [];
  
  // Propositions récentes
  const recentPropositions = allPropositions?.slice(0, 10) || [];

  type RecentPropositionRow = { id: string } & Record<string, unknown>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Admin</h1>
        <p className="text-gray-600 mt-2">
          Vue d&apos;ensemble de la plateforme
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Clients */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Clients</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {totalClients}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Total Propositions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Propositions</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {totalPropositions}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Total Crédits */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Crédits Actifs</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(totalCredits)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Revenu Total */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revenu Total</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(totalRevenue)}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats mensuelles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Ce mois</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Nouveaux clients</p>
              <p className="text-2xl font-bold text-gray-900">{clientsCeMois}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Propositions</p>
              <p className="text-2xl font-bold text-gray-900">{propositionsCeMois}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Revenu</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(revenueCeMois)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-900">Performance</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Taux de succès</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalPropositions > 0
                  ? Math.round((propositionsExportees / totalPropositions) * 100)
                  : 0}
                %
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Exportées</p>
              <p className="text-2xl font-bold text-gray-900">{propositionsExportees}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Crédits</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Total en circulation</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalCredits)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Moyenne par client</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalClients > 0 ? formatCurrency(totalCredits / totalClients) : formatCurrency(0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Clients */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Clients Récents</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Secteur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Crédits
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date création
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {client.nom}
                      </div>
                      <div className="text-sm text-gray-500">{client.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {client.secteur}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(client.credits || 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(client.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <a
                      href={`/admin/clients/${client.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Voir détails
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Propositions Récentes */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Propositions Récentes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nom
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentPropositions?.map((prop) => {
                const p = prop as RecentPropositionRow;
                return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {String(p.organization_id ?? '')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {typeof p.nom_client === 'string' && p.nom_client ? p.nom_client : 'Sans nom'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        p.statut === 'exported'
                          ? 'bg-green-100 text-green-800'
                          : p.statut === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {String(p.statut ?? '')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(String(p.created_at ?? ''))}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
