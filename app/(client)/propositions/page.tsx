import { createClient, createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { 
  Plus, 
  Download, 
  Eye, 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Sparkles,
  FileSearch,
  Zap,
  AlertTriangle,
  type LucideIcon
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { DeletePropositionButton } from '@/components/propositions/DeletePropositionButton';
import { cleanupOldPropositions } from '@/lib/propositions/cleanup';

export const revalidate = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Configuration des statuts
const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: LucideIcon; gradient: string; bgColor: string }
> = {
  exported: { 
    label: 'Exportée', 
    color: 'text-emerald-700', 
    icon: CheckCircle2, 
    gradient: 'from-emerald-500 to-emerald-600',
    bgColor: 'bg-emerald-50 border-emerald-200' 
  },
  ready: { 
    label: 'Prête', 
    color: 'text-purple-700', 
    icon: Zap, 
    gradient: 'from-purple-500 to-purple-600',
    bgColor: 'bg-purple-50 border-purple-200' 
  },
  extracted: { 
    label: 'Extraite', 
    color: 'text-blue-700', 
    icon: FileSearch, 
    gradient: 'from-blue-500 to-blue-600',
    bgColor: 'bg-blue-50 border-blue-200' 
  },
  processing: { 
    label: 'En cours', 
    color: 'text-amber-700', 
    icon: Clock, 
    gradient: 'from-amber-500 to-amber-600',
    bgColor: 'bg-amber-50 border-amber-200' 
  },
  draft: { 
    label: 'Brouillon', 
    color: 'text-gray-700', 
    icon: FileText, 
    gradient: 'from-gray-500 to-gray-600',
    bgColor: 'bg-gray-50 border-gray-200' 
  },
  error: { 
    label: 'Erreur', 
    color: 'text-red-700', 
    icon: AlertTriangle, 
    gradient: 'from-red-500 to-red-600',
    bgColor: 'bg-red-50 border-red-200' 
  },
};

function getStatusConfig(statut: string) {
  return STATUS_CONFIG[statut] || STATUS_CONFIG.processing;
}

// Compte les champs extraits
function countFields(data: unknown): number {
  if (!isRecord(data) && !Array.isArray(data)) return 0;
  if (Array.isArray(data)) return data.length;
  let count = 0;
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      count += value.length;
    } else if (typeof value === 'object') {
      count += Object.keys(value as Record<string, unknown>).length;
    } else {
      count += 1;
    }
  }
  return count;
}

function getClientName(extractedData: unknown): string {
  try {
    const data: Record<string, unknown> = isRecord(extractedData) ? extractedData : {};

    if (isRecord(data.client)) {
      const nom = data.client.nom;
      const name = data.client.name;
      if (typeof nom === 'string' && nom) return nom;
      if (typeof name === 'string' && name) return name;
    }

    const clientNom = data['client.nom'];
    if (typeof clientNom === 'string' && clientNom) return clientNom;

    const clientPrenom = data['client.prenom'];
    const clientNom2 = data['client.nom'];
    if (typeof clientPrenom === 'string' && clientPrenom && typeof clientNom2 === 'string' && clientNom2) {
      return `${clientPrenom} ${clientNom2}`;
    }

    if (typeof data.nom_client === 'string' && data.nom_client) return data.nom_client;
    if (typeof data.client_nom === 'string' && data.client_nom) return data.client_nom;

    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('client') && isRecord(value)) {
        const nom = value.nom;
        const name = value.name;
        if (typeof nom === 'string' && nom) return nom;
        if (typeof name === 'string' && name) return name;
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

  if (user?.id) {
    const serviceSupabase = createServiceClient();
    await cleanupOldPropositions(serviceSupabase, user.id, 15);
  }

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Mes Propositions
            </h1>
            <p className="text-gray-600 mt-2 text-lg">
              Suivez et gérez toutes vos propositions commerciales
            </p>
          </div>
          <Link
            href="/propositions/new"
            className="group px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all font-semibold shadow-lg shadow-green-500/30 flex items-center gap-2 hover:scale-105 active:scale-95 w-fit"
          >
            <Plus className="w-5 h-5" />
            Nouvelle Proposition
            <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          </Link>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-lg flex items-center justify-center shadow-lg shadow-gray-500/30 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">proposition{stats.total > 1 ? 's' : ''} créée{stats.total > 1 ? 's' : ''}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600">Exportées</p>
            </div>
            <p className="text-3xl font-bold text-emerald-600">{stats.exported}</p>
            <p className="text-xs text-gray-500 mt-1">prête{stats.exported > 1 ? 's' : ''} à télécharger</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600">En attente</p>
            </div>
            <p className="text-3xl font-bold text-blue-600">{stats.pending}</p>
            <p className="text-xs text-gray-500 mt-1">en traitement</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600">Erreurs</p>
            </div>
            <p className="text-3xl font-bold text-red-600">{stats.error}</p>
            <p className="text-xs text-gray-500 mt-1">à corriger</p>
          </div>
        </div>

        {/* Liste des propositions */}
        {propositions && propositions.length > 0 ? (
          <div className="space-y-4">
            {propositions.map((prop) => {
              const status = getStatusConfig(prop.statut);
              const StatusIcon = status.icon;
              const fieldsCount = countFields(prop.extracted_data || prop.donnees_extraites);
              const fileUrl = prop.duplicated_template_url || prop.fichier_genere_url;
              const clientName = getClientName(prop.extracted_data || prop.donnees_extraites) || prop.nom_client || 'Sans nom';
              
              return (
                <div
                  key={prop.id}
                  className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300"
                >
                  <div className="flex items-center justify-between gap-6">
                    {/* Client Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30 flex-shrink-0 group-hover:scale-110 transition-transform">
                        {clientName[0]?.toUpperCase() || 'C'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-lg truncate group-hover:text-blue-600 transition-colors">
                          {clientName}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-sm text-gray-600">
                            📄 {prop.template?.nom || 'Template N/A'}
                          </span>
                          {fieldsCount > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                              {fieldsCount} champs
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {formatDate(prop.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${status.bgColor} flex-shrink-0`}>
                      <div className={`w-8 h-8 bg-gradient-to-br ${status.gradient} rounded-lg flex items-center justify-center shadow-lg`}>
                        <StatusIcon className="w-4 h-4 text-white" />
                      </div>
                      <span className={`font-semibold text-sm ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Bouton Reprendre (draft) */}
                      {prop.statut === 'draft' && (
                        <Link
                          href={`/propositions/${prop.id}/resume`}
                          className="px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all flex items-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          Reprendre
                        </Link>
                      )}

                      {/* Bouton Générer */}
                      {['ready', 'extracted'].includes(prop.statut) && (
                        <GenerateButton propositionId={prop.id} variant="small" />
                      )}

                      {/* Bouton Télécharger */}
                      {prop.statut === 'exported' && fileUrl && (
                        <a
                          href={fileUrl}
                          download
                          className="px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-2"
                          title="Télécharger la proposition"
                        >
                          <Download className="w-4 h-4" />
                          Télécharger
                        </a>
                      )}

                      {/* Bouton Voir */}
                      <Link
                        href={`/propositions/${prop.id}`}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        Détails
                      </Link>

                      {/* Bouton Supprimer */}
                      <DeletePropositionButton propositionId={prop.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Aucune proposition pour le moment
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed">
                Créez votre première proposition commerciale automatiquement à partir d&apos;un template et de vos documents
              </p>
              <Link
                href="/propositions/new"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all font-semibold shadow-lg shadow-green-500/30 hover:scale-105 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                Créer ma première proposition
                <Sparkles className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
