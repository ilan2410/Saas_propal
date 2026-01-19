import { CreditCard } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/formatting';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const revalidate = 0;

export default async function TransactionsPage() {
  // Utiliser le client admin pour voir toutes les transactions
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

  // Récupérer toutes les transactions avec les organizations
  const { data: transactions } = await supabaseAdmin
    .from('stripe_transactions')
    .select(`
      *,
      organization:organizations(nom, email)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  // Calculer les stats
  const totalTransactions = transactions?.length || 0;
  const totalMontant = transactions?.reduce((sum, t) => sum + (t.montant || 0), 0) || 0;
  const totalCredits = transactions?.reduce((sum, t) => sum + (t.credits_ajoutes || 0), 0) || 0;
  const transactionsReussies = transactions?.filter(t => t.statut === 'succeeded').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-600 mt-2">
          Historique de tous les achats de crédits
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total transactions</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {totalTransactions}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Montant total</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(totalMontant)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Crédits vendus</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(totalCredits)}
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
              <p className="text-sm text-gray-600">Taux de réussite</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {totalTransactions > 0
                  ? Math.round((transactionsReussies / totalTransactions) * 100)
                  : 0}
                %
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {transactions && transactions.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Montant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Crédits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Bonus
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((trans: any) => (
                  <tr key={trans.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(trans.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {trans.organization?.nom || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {trans.organization?.email || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(trans.montant)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      +{formatCurrency(trans.credits_ajoutes)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {trans.bonus_applique > 0 ? `+${trans.bonus_applique}%` : '-'}
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
                        {trans.statut === 'succeeded'
                          ? 'Réussi'
                          : trans.statut === 'failed'
                          ? 'Échoué'
                          : 'En attente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Aucune transaction</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
