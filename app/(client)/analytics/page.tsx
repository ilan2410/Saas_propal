import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BarChart3, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatting';

export const revalidate = 0;

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Récupérer l'organization
  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', user.id)
    .single();

  // Récupérer toutes les propositions
  const { data: propositions } = await supabase
    .from('propositions')
    .select('*')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  // Récupérer toutes les transactions
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('*')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  // Calculer les stats globales
  const totalPropositions = propositions?.length || 0;
  const propositionsExportees = propositions?.filter((p) => p.statut === 'exported').length || 0;
  const propositionsEnErreur = propositions?.filter((p) => p.statut === 'error').length || 0;
  const totalDepense = transactions?.filter((t) => t.statut === 'succeeded')
    .reduce((sum, t) => sum + (t.montant || 0), 0) || 0;
  const totalCreditsAchetes = transactions?.filter((t) => t.statut === 'succeeded')
    .reduce((sum, t) => sum + (t.credits_ajoutes || 0), 0) || 0;

  // Stats par mois (6 derniers mois)
  const now = new Date();
  const monthsData = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    
    const propositionsMonth = propositions?.filter(
      (p) => new Date(p.created_at) >= date && new Date(p.created_at) < nextDate
    ).length || 0;

    const transactionsMonth = transactions?.filter(
      (t) => t.statut === 'succeeded' && new Date(t.created_at) >= date && new Date(t.created_at) < nextDate
    );

    const depenseMonth = transactionsMonth?.reduce((sum, t) => sum + (t.montant || 0), 0) || 0;

    monthsData.push({
      month: date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      propositions: propositionsMonth,
      depense: depenseMonth,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-2">
          {"Vue d'ensemble de votre activité"}
        </p>
      </div>

      {/* Stats principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total propositions</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {totalPropositions}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Taux de succès</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {totalPropositions > 0
                  ? Math.round((propositionsExportees / totalPropositions) * 100)
                  : 0}
                %
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Crédits achetés</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(totalCreditsAchetes)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total dépensé</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(totalDepense)}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Évolution sur 6 mois */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Évolution des 6 derniers mois
        </h2>
        <div className="space-y-4">
          {monthsData.map((data, index) => (
            <div key={index} className="border-b border-gray-100 pb-4 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {data.month}
                </span>
                <div className="flex gap-6 text-sm">
                  <span className="text-blue-600">
                    {data.propositions} proposition{data.propositions > 1 ? 's' : ''}
                  </span>
                  <span className="text-orange-600">
                    {formatCurrency(data.depense)} dépensé{data.depense > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <div
                  className="h-2 bg-blue-500 rounded"
                  style={{
                    width: `${totalPropositions > 0 ? (data.propositions / totalPropositions) * 100 : 0}%`,
                    minWidth: data.propositions > 0 ? '2%' : '0',
                  }}
                />
                <div
                  className="h-2 bg-orange-500 rounded"
                  style={{
                    width: `${totalDepense > 0 ? (data.depense / totalDepense) * 100 : 0}%`,
                    minWidth: data.depense > 0 ? '2%' : '0',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Répartition par statut */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            Répartition par statut
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-700">Exportées</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {propositionsExportees} ({totalPropositions > 0 ? Math.round((propositionsExportees / totalPropositions) * 100) : 0}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-sm text-gray-700">En cours</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {totalPropositions - propositionsExportees - propositionsEnErreur}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-sm text-gray-700">En erreur</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {propositionsEnErreur}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            Utilisation des crédits
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Solde actuel</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(organization?.credits || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Total acheté</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(totalCreditsAchetes)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Consommé</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(totalCreditsAchetes - (organization?.credits || 0))}
              </span>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <span className="text-sm text-gray-700">Coût par proposition</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(organization?.tarif_par_proposition || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
