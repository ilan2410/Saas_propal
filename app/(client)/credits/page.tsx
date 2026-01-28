import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CreditCard, Plus, History, TrendingUp, Zap, Shield } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/formatting';
import { CreditPurchaseForm } from '@/components/credits/CreditPurchaseForm';
import { PendingTransactionActions } from '@/components/credits/PendingTransactionActions';

export const revalidate = 0;

export default async function CreditsPage() {
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

  // Récupérer les transactions
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('*')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const credits = organization?.credits || 0;
  const tarifParProposition = organization?.tarif_par_proposition || 5;
  const propositionsPossibles = Math.floor(credits / tarifParProposition);

  return (
    <div className="mx-auto max-w-7xl space-y-12 pb-16">
      {/* Header avec statistiques */}
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Gestion des crédits
          </h1>
          <p className="mt-2 text-base text-gray-600">
            Rechargez votre compte en quelques secondes et suivez vos dépenses en temps réel
          </p>
        </div>

        {/* Carte de solde premium */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-8 shadow-2xl shadow-purple-500/20 lg:p-10">
          {/* Effets de background */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute right-1/4 top-1/3 h-32 w-32 rounded-full bg-pink-400/20 blur-2xl" />

          <div className="relative">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
                    <CreditCard className="h-6 w-6 text-white" />
                  </div>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm ring-1 ring-white/30">
                    Solde actuel
                  </span>
                </div>

                <div className="mt-6 flex items-baseline gap-4">
                  <h2 className="text-6xl font-bold tracking-tight text-white lg:text-7xl">
                    {formatCurrency(credits)}
                  </h2>
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-white/80">
                      ≈ {propositionsPossibles} proposition{propositionsPossibles > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm text-white/60">
                      disponible{propositionsPossibles > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Ajout instantané</p>
                      <p className="text-xs text-white/70">Crédits disponibles immédiatement</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                      <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Paiement sécurisé</p>
                      <p className="text-xs text-white/70">Powered by Stripe</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini stats */}
              <div className="hidden lg:block">
                <div className="rounded-2xl bg-white/10 p-5 backdrop-blur-sm ring-1 ring-white/20">
                  <p className="text-sm font-medium text-white/80">Tarif unitaire</p>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {formatCurrency(tarifParProposition)}
                  </p>
                  <p className="mt-1 text-xs text-white/70">par proposition</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section de recharge */}
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm lg:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <Plus className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Recharger votre compte
            </h2>
            <p className="text-sm text-gray-600">
              Choisissez un forfait ou entrez un montant personnalisé
            </p>
          </div>
        </div>

        <CreditPurchaseForm organizationId={user.id} />
      </div>

      {/* Historique des transactions */}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-8 lg:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
              <History className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Historique des transactions
              </h2>
              <p className="text-sm text-gray-600">
                Les 20 dernières opérations sur votre compte
              </p>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          {transactions && transactions.length > 0 ? (
            <div className="space-y-4">
              {transactions.map((trans) => {
                const statusConfig = {
                  succeeded: {
                    label: 'Réussi',
                    bg: 'bg-emerald-50',
                    text: 'text-emerald-700',
                    ring: 'ring-emerald-100',
                    dot: 'bg-emerald-500',
                  },
                  failed: {
                    label: 'Échoué',
                    bg: 'bg-rose-50',
                    text: 'text-rose-700',
                    ring: 'ring-rose-100',
                    dot: 'bg-rose-500',
                  },
                  pending: {
                    label: 'En attente',
                    bg: 'bg-amber-50',
                    text: 'text-amber-700',
                    ring: 'ring-amber-100',
                    dot: 'bg-amber-500',
                  },
                  canceled: {
                    label: 'Annulé',
                    bg: 'bg-gray-100',
                    text: 'text-gray-700',
                    ring: 'ring-gray-200',
                    dot: 'bg-gray-500',
                  },
                };

                const status = statusConfig[trans.statut as keyof typeof statusConfig] || statusConfig.pending;

                return (
                  <div
                    key={trans.id}
                    className="group flex items-center justify-between gap-6 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50/50 to-white p-5 transition-all hover:border-gray-300 hover:shadow-md"
                  >
                    <div className="flex flex-1 items-center gap-5">
                      {/* Date */}
                      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
                        <span className="text-xs font-medium text-gray-500">
                          {new Date(trans.created_at).toLocaleDateString('fr-FR', { month: 'short' })}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {new Date(trans.created_at).getDate()}
                        </span>
                      </div>

                      {/* Détails */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <p className="text-base font-semibold text-gray-900">
                            Recharge de {formatCurrency(trans.montant)}
                          </p>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${status.bg} ${status.text} ${status.ring}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {formatDate(trans.created_at)} à {new Date(trans.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>

                        {trans.statut === 'pending' && (
                          <div className="mt-4">
                            <PendingTransactionActions transactionId={trans.id} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Crédits et bonus */}
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-500">Crédits</p>
                        <p className="mt-1 text-xl font-bold text-gray-900">
                          +{formatCurrency(trans.credits_ajoutes)}
                        </p>
                      </div>
                      {trans.bonus_applique > 0 && (
                        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-3 ring-1 ring-emerald-100">
                          <p className="text-xs font-medium text-emerald-600">Bonus</p>
                          <p className="mt-1 text-lg font-bold text-emerald-700">
                            +{trans.bonus_applique}%
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100">
                <History className="h-10 w-10 text-gray-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Aucune transaction pour le moment</p>
                <p className="mt-1 text-sm text-gray-600">
                  Vos prochains achats de crédits apparaîtront ici
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section informations / FAQ */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6">
          <TrendingUp className="h-8 w-8 text-blue-600" />
          <h3 className="mt-4 text-base font-semibold text-gray-900">
            Bonus progressifs
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Plus vous rechargez, plus le bonus est important. Jusqu&apos;à +15% sur les forfaits Enterprise.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6">
          <Zap className="h-8 w-8 text-emerald-600" />
          <h3 className="mt-4 text-base font-semibold text-gray-900">
            Instantané
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Vos crédits sont crédités immédiatement après validation du paiement. Aucune attente.
          </p>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-6">
          <Shield className="h-8 w-8 text-purple-600" />
          <h3 className="mt-4 text-base font-semibold text-gray-900">
            100% sécurisé
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Paiements sécurisés par Stripe. Vos données bancaires ne transitent jamais par nos serveurs.
          </p>
        </div>
      </div>
    </div>
  );
}
