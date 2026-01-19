import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Download, Eye, FileText, Clock, CheckCircle, AlertCircle, Loader2, Calendar, User, FileSpreadsheet } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { DeletePropositionButton } from '@/components/propositions/DeletePropositionButton';

export const revalidate = 0;

// Configuration des statuts
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bgColor: string }> = {
  exported: { label: 'Exportée', color: 'text-green-700', icon: '✓', bgColor: 'bg-green-100' },
  ready: { label: 'Prête', color: 'text-blue-700', icon: '●', bgColor: 'bg-blue-100' },
  extracted: { label: 'Extraite', color: 'text-blue-700', icon: '●', bgColor: 'bg-blue-100' },
  processing: { label: 'En cours', color: 'text-yellow-700', icon: '⟳', bgColor: 'bg-yellow-100' },
  draft: { label: 'Brouillon', color: 'text-amber-700', icon: '⏸', bgColor: 'bg-amber-100' },
  error: { label: 'Erreur', color: 'text-red-700', icon: '✗', bgColor: 'bg-red-100' },
};

function getStatusConfig(statut: string) {
  return STATUS_CONFIG[statut] || STATUS_CONFIG.processing;
}

// Compte les champs extraits
function countFields(data: any): number {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;
  for (const value of Object.values(data)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      count += value.length;
    } else if (typeof value === 'object') {
      count += Object.keys(value).length;
    } else {
      count += 1;
    }
  }
  return count;
}

function getClientName(extractedData: any): string {
  try {
    const data = extractedData || {};

    if (data.client) {
      if (data.client.nom) return data.client.nom;
      if (data.client.name) return data.client.name;
    }

    if (data['client.nom']) return data['client.nom'];
    if (data['client.prenom'] && data['client.nom']) {
      return `${data['client.prenom']} ${data['client.nom']}`;
    }

    if (data.nom_client) return data.nom_client;
    if (data.client_nom) return data.client_nom;

    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('client') && typeof value === 'object' && value !== null) {
        const clientObj = value as any;
        if (clientObj.nom) return clientObj.nom;
        if (clientObj.name) return clientObj.name;
      }
    }

    return 'Sans nom';
  } catch {
    return 'Sans nom';
  }
}

export default async function PropositionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Récupérer toutes les propositions avec les templates
  const { data: propositions } = await supabase
    .from('propositions')
    .select(`
      *,
      template:proposition_templates(nom)
    `)
    .eq('organization_id', user?.id)
    .order('created_at', { ascending: false });

  // Statistiques
  const stats = {
    total: propositions?.length || 0,
    exported: propositions?.filter(p => p.statut === 'exported').length || 0,
    pending: propositions?.filter(p => ['draft', 'ready', 'extracted', 'processing'].includes(p.statut)).length || 0,
    error: propositions?.filter(p => p.statut === 'error').length || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Propositions</h1>
            <p className="text-gray-600 mt-2">
              Gérez et suivez vos propositions commerciales
            </p>
          </div>
          <Link
            href="/propositions/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-md hover:shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Nouvelle Proposition
          </Link>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileText className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.exported}</p>
                <p className="text-xs text-gray-500">Exportées</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.pending}</p>
                <p className="text-xs text-gray-500">En attente</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.error}</p>
                <p className="text-xs text-gray-500">Erreurs</p>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des propositions */}
        {propositions && propositions.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Champs
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
                <tbody className="divide-y divide-gray-200">
                  {propositions.map((prop) => {
                    const status = getStatusConfig(prop.statut);
                    const fieldsCount = countFields(prop.extracted_data || prop.donnees_extraites);
                    const fileUrl = prop.duplicated_template_url || prop.fichier_genere_url;
                    const clientName = getClientName(prop.extracted_data || prop.donnees_extraites) || prop.nom_client || 'Sans nom';
                    
                    return (
                      <tr key={prop.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <User className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {clientName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {prop.template?.nom || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {fieldsCount} champs
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                            <span>{status.icon}</span>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            {formatDate(prop.created_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {prop.statut === 'draft' && (
                              <Link
                                href={`/propositions/${prop.id}/resume`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                              >
                                Reprendre
                              </Link>
                            )}
                            <Link
                              href={`/propositions/${prop.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              Voir
                            </Link>
                            {/* Bouton Générer si prête */}
                            {['ready', 'extracted'].includes(prop.statut) && (
                              <GenerateButton propositionId={prop.id} variant="small" />
                            )}
                            {/* Bouton Télécharger si exportée */}
                            {prop.statut === 'exported' && fileUrl && (
                              <a
                                href={fileUrl}
                                download
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}

                            <DeletePropositionButton propositionId={prop.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Aucune proposition
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Créez votre première proposition commerciale à partir d'un template
            </p>
            <Link
              href="/propositions/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Créer une proposition
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
