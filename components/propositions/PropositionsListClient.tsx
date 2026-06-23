'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Eye,
  FileText,
  Clock,
  CheckCircle2,
  Calendar,
  Sparkles,
  FileSearch,
  Zap,
  AlertTriangle,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { DeletePropositionButton } from '@/components/propositions/DeletePropositionButton';

export type PropositionListItem = {
  id: string;
  statut: string;
  templateNom: string;
  clientName: string;
  fieldsCount: number;
  fileUrl: string | null;
  createdAt: string;
  hasSuggestions: boolean;
};

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
    bgColor: 'bg-emerald-50 border-emerald-200',
  },
  ready: {
    label: 'Prête',
    color: 'text-purple-700',
    icon: Zap,
    gradient: 'from-purple-500 to-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
  },
  extracted: {
    label: 'Extraite',
    color: 'text-blue-700',
    icon: FileSearch,
    gradient: 'from-blue-500 to-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
  },
  processing: {
    label: 'En cours',
    color: 'text-amber-700',
    icon: Clock,
    gradient: 'from-amber-500 to-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
  },
  draft: {
    label: 'Brouillon',
    color: 'text-gray-700',
    icon: FileText,
    gradient: 'from-gray-500 to-gray-600',
    bgColor: 'bg-gray-50 border-gray-200',
  },
  error: {
    label: 'Erreur',
    color: 'text-red-700',
    icon: AlertTriangle,
    gradient: 'from-red-500 to-red-600',
    bgColor: 'bg-red-50 border-red-200',
  },
};

function getStatusConfig(statut: string) {
  return STATUS_CONFIG[statut] || STATUS_CONFIG.processing;
}

// Normalise une chaîne pour une recherche insensible à la casse et aux accents
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

export function PropositionsListClient({ propositions }: { propositions: PropositionListItem[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return propositions;
    // Recherche intelligente : chaque mot doit correspondre à un des champs
    const terms = q.split(/\s+/).filter(Boolean);
    return propositions.filter((prop) => {
      const haystack = normalize(
        [
          prop.clientName,
          prop.templateNom,
          getStatusConfig(prop.statut).label,
          formatDate(prop.createdAt),
        ].join(' ')
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [propositions, query]);

  return (
    <div className="space-y-6">
      {/* Barre de recherche */}
      <div className="relative max-w-xl">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par client, template, statut..."
          className="w-full pl-12 pr-12 py-3 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Effacer la recherche"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {query && (
        <p className="text-sm text-gray-500 -mt-2">
          {filtered.length} résultat{filtered.length > 1 ? 's' : ''} pour «&nbsp;{query}&nbsp;»
        </p>
      )}

      {/* Liste des propositions */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((prop) => {
            const status = getStatusConfig(prop.statut);
            const StatusIcon = status.icon;
            const clientName = prop.clientName || 'Sans nom';

            return (
              <div
                key={prop.id}
                className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  {/* Client Info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                    <Link
                      href={`/propositions/${prop.id}`}
                      className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30 flex-shrink-0 group-hover:scale-110 transition-transform"
                    >
                      {clientName[0]?.toUpperCase() || 'C'}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/propositions/${prop.id}`}
                        className="block"
                      >
                        <h3 className="font-bold text-gray-900 text-lg truncate group-hover:text-blue-600 transition-colors hover:underline">
                          {clientName}
                        </h3>
                      </Link>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-sm text-gray-600">
                          📄 {prop.templateNom || 'Template N/A'}
                        </span>
                        {prop.fieldsCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                            {prop.fieldsCount} champs
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {formatDate(prop.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto flex-wrap">
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
                    <div className="flex items-center gap-2 flex-wrap justify-end flex-1 md:flex-none">
                      {/* Bouton Reprendre (draft) */}
                      {['draft', 'ready', 'extracted'].includes(prop.statut) && (
                        <Link
                          href={`/propositions/${prop.id}/resume`}
                          className="px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all flex items-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          Reprendre
                        </Link>
                      )}

                      {/* Bouton Suggestions IA */}
                      {prop.hasSuggestions && (
                        <Link
                          href={`/propositions/${prop.id}/resume?step=4`}
                          className="px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-all flex items-center gap-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          SP suggerée
                        </Link>
                      )}

                      {/* Bouton Générer */}
                      {['ready', 'extracted'].includes(prop.statut) && (
                        <GenerateButton propositionId={prop.id} variant="small" />
                      )}

                      {/* Bouton Télécharger */}
                      {prop.statut === 'exported' && prop.fileUrl && (
                        <a
                          href={prop.fileUrl}
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
              </div>
            );
          })}
        </div>
      ) : (
        /* Aucun résultat de recherche */
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Search className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Aucun résultat</h3>
            <p className="text-gray-600">
              Aucune proposition ne correspond à votre recherche «&nbsp;{query}&nbsp;».
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
