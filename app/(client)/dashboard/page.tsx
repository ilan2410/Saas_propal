import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { 
  Plus, 
  FileText, 
  Zap, 
  TrendingUp, 
  TrendingDown,
  BarChart3, 
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Download
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/formatting';

export const revalidate = 0;

export default async function ClientDashboard() {
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

  // Récupérer les templates
  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('*')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  // Récupérer TOUTES les propositions pour les stats
  const { data: allPropositions } = await supabase
    .from('propositions')
    .select('*')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  // Récupérer les propositions récentes pour l'affichage
  const propositions = allPropositions?.slice(0, 5) || [];

  // Récupérer les transactions
  const { data: transactions } = await supabase
    .from('stripe_transactions')
    .select('*')
    .eq('organization_id', user.id)
    .eq('statut', 'succeeded')
    .order('created_at', { ascending: false });

  // Calculer les stats
  const totalTemplates = templates?.length || 0;
  const totalPropositions = allPropositions?.length || 0;
  const templatesActifs = templates?.filter((t) => t.statut === 'actif').length || 0;
  const propositionsExportees =
    allPropositions?.filter((p) => p.statut === 'exported' || !!p.exported_at || !!p.duplicated_template_url)
      .length || 0;
  const totalDepense = transactions?.reduce((sum, t) => sum + (t.montant || 0), 0) || 0;
  
  // Stats du mois en cours
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  
  const propositionsCeMois = allPropositions?.filter(
    (p) => new Date(p.created_at) >= startOfMonth
  ).length || 0;

  const propositionsMoisDernier = allPropositions?.filter(
    (p) => {
      const date = new Date(p.created_at);
      return date >= startOfLastMonth && date <= endOfLastMonth;
    }
  ).length || 0;

  // Calculer la tendance
  const tendancePropositions = propositionsMoisDernier > 0 
    ? ((propositionsCeMois - propositionsMoisDernier) / propositionsMoisDernier) * 100 
    : 0;

  // Taux de conversion
  const tauxConversion = totalPropositions > 0 
    ? ((propositionsExportees / totalPropositions) * 100).toFixed(1)
    : 0;

  // Activité des 6 derniers mois (pour le graphique)
  const derniersMois = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
    const count = allPropositions?.filter((p) => {
      const propDate = new Date(p.created_at);
      return propDate >= date && propDate < nextMonth;
    }).length || 0;
    
    return {
      mois: date.toLocaleDateString('fr-FR', { month: 'short' }),
      count
    };
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      {/* Hero Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Bonjour, {organization?.nom || 'Bienvenue'} 👋
              </h1>
              <p className="text-gray-600 mt-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date().toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/templates"
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all font-medium"
              >
                Mes templates
              </Link>
              <Link
                href="/propositions/new"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-medium flex items-center gap-2 shadow-lg shadow-blue-500/30"
              >
                <Sparkles className="w-4 h-4" />
                Nouvelle proposition
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats principales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Crédits */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 border border-gray-100 group">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  Crédits disponibles
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatCurrency(organization?.credits || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {formatCurrency(organization?.tarif_par_proposition || 0)} / proposition
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Templates */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 border border-gray-100 group">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  Templates
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {totalTemplates}
                </p>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  {templatesActifs} actifs
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Propositions */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 border border-gray-100 group">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  Propositions
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {totalPropositions}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {tendancePropositions >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${tendancePropositions >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tendancePropositions >= 0 ? '+' : ''}{tendancePropositions.toFixed(0)}% ce mois
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Taux de conversion */}
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-6 border border-gray-100 group">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  Taux de conversion
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {tauxConversion}%
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {propositionsExportees} exportées
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Graphique d'activité + Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Graphique */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Activité des 6 derniers mois</h3>
                <p className="text-sm text-gray-500 mt-1">Évolution de vos propositions générées</p>
              </div>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            
            {/* Graphique simple en barres */}
            <div className="space-y-4">
              {derniersMois.map((mois, idx) => {
                const maxCount = Math.max(...derniersMois.map(m => m.count), 1);
                const percentage = (mois.count / maxCount) * 100;
                
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700 capitalize">{mois.mois}</span>
                      <span className="text-gray-900 font-semibold">{mois.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            {/* Ce mois */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-5 h-5 opacity-80" />
                <span className="text-sm font-medium opacity-90">Ce mois</span>
              </div>
              <p className="text-4xl font-bold mb-2">{propositionsCeMois}</p>
              <p className="text-sm opacity-80">propositions générées</p>
            </div>

            {/* Dépenses totales */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">💳</span>
                </div>
                <span className="text-sm font-medium text-gray-600">Dépenses totales</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalDepense)}</p>
              <p className="text-xs text-gray-500 mt-2">{transactions?.length || 0} transactions</p>
            </div>

            {/* Alert crédits faibles */}
            {(organization?.credits || 0) < 50 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Crédits faibles</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Pensez à recharger vos crédits
                    </p>
                    <Link 
                      href="/credits"
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium mt-2 inline-block"
                    >
                      Recharger →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions rapides */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/templates/new"
            className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 p-8 border border-gray-100 hover:border-blue-200 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full"></div>
            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300">
                  <Plus className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Créer un template</h3>
                  <p className="text-sm text-gray-600">
                    Configurez un nouveau modèle personnalisé
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </Link>

          <Link
            href="/propositions/new"
            className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 p-8 border border-gray-100 hover:border-emerald-200 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full"></div>
            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Générer une proposition</h3>
                  <p className="text-sm text-gray-600">
                    Créez une nouvelle proposition en quelques clics
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </Link>
        </div>

        {/* Propositions récentes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Activité récente</h2>
              <p className="text-sm text-gray-500 mt-1">Vos dernières propositions générées</p>
            </div>
            <Link
              href="/propositions"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 group"
            >
              Voir tout
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          
          {propositions && propositions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {propositions.map((prop) => (
                    <tr key={prop.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold shadow-sm">
                            {(prop.nom_client || 'SC')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {prop.nom_client || 'Sans nom'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {prop.email_client || 'Pas d\'email'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full ${
                            prop.statut === 'exported'
                              ? 'bg-emerald-100 text-emerald-700'
                              : prop.statut === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {prop.statut === 'exported' && <CheckCircle2 className="w-3 h-3" />}
                          {prop.statut === 'error' && <AlertCircle className="w-3 h-3" />}
                          {prop.statut === 'processing' && <Clock className="w-3 h-3" />}
                          {prop.statut}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {formatDate(prop.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {prop.statut === 'exported' && (
                            <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          <Link
                            href={`/propositions/${prop.id}`}
                            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            Voir détails
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 px-6">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Aucune proposition pour le moment
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Commencez par créer votre première proposition commerciale en utilisant l&apos;un de vos templates
              </p>
              <Link
                href="/propositions/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-medium shadow-lg shadow-blue-500/30"
              >
                <Sparkles className="w-5 h-5" />
                Créer ma première proposition
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
