'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { cn } from '@/lib/utils';
import {
  getStatutTechnique,
  STATUT_COMMERCIAL_ORDRE,
  STATUT_TECHNIQUE_ORDRE,
  type StatutCommercial,
} from '@/lib/propositions/status';
import { PropositionStatusBadge } from '@/components/propositions/PropositionStatusBadge';
import { StatutCommercialSelect } from '@/components/propositions/StatutCommercialSelect';
import { PropositionRowMenu } from '@/components/propositions/PropositionRowMenu';
import { PropositionNotesActions } from '@/components/propositions/PropositionNotesActions';

export type PropositionListItem = {
  id: string;
  statut: string;
  statutCommercial: StatutCommercial;
  templateNom: string;
  clientName: string;
  fieldsCount: number;
  notesCount: number;
  createdAt: string;
};

export type PropositionCounts = {
  toutes: number;
  brouillons: number;
  en_cours: number;
  en_attente_client: number;
  signee: number;
  perdue: number;
};

type FilterKey = keyof PropositionCounts;
type SortKey = 'client' | 'statut' | 'date';
type SortDir = 'asc' | 'desc';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'brouillons', label: 'Brouillons' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'en_attente_client', label: 'En attente client' },
  { key: 'signee', label: 'Signées' },
  { key: 'perdue', label: 'Perdues' },
];

const RESUMABLE = ['draft', 'ready', 'extracted'];

// Normalise pour une recherche insensible à la casse et aux accents.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

function matchesFilter(prop: PropositionListItem, filter: FilterKey): boolean {
  if (filter === 'toutes') return true;
  if (filter === 'brouillons') return prop.statut !== 'exported';
  return prop.statut === 'exported' && prop.statutCommercial === filter;
}

// Rang pour le tri « Statut » : non-exportées d'abord (ordre technique),
// puis exportées par ordre de statut commercial.
function statutRank(prop: PropositionListItem): number {
  if (prop.statut !== 'exported') {
    return STATUT_TECHNIQUE_ORDRE[prop.statut] ?? 2;
  }
  return 100 + (STATUT_COMMERCIAL_ORDRE[prop.statutCommercial] ?? 0);
}

export function PropositionsListClient({
  propositions,
  counts,
}: {
  propositions: PropositionListItem[];
  counts: PropositionCounts;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('toutes');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'date',
    dir: 'desc',
  });

  const visible = useMemo(() => {
    const q = normalize(query);
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];

    const filtered = propositions.filter((prop) => {
      if (!matchesFilter(prop, filter)) return false;
      if (!terms.length) return true;
      const haystack = normalize(
        [
          prop.clientName,
          prop.templateNom,
          getStatutTechnique(prop.statut).label,
          formatDate(prop.createdAt),
        ].join(' '),
      );
      return terms.every((term) => haystack.includes(term));
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'client') {
        cmp = normalize(a.clientName).localeCompare(normalize(b.clientName));
      } else if (sort.key === 'statut') {
        cmp = statutRank(a) - statutRank(b);
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (cmp === 0) {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return cmp * dir;
    });
  }, [propositions, query, filter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'date' ? 'desc' : 'asc' },
    );
  };

  const goToDetail = (id: string) => router.push(`/propositions/${id}`);

  return (
    <div className="space-y-4">
      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  filter === key
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500',
                )}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">
            Aucune proposition ne correspond à ces critères.
          </p>
        </div>
      ) : (
        <>
          {/* Tableau (desktop) */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <Th
                    label="Client"
                    active={sort.key === 'client'}
                    dir={sort.dir}
                    onClick={() => toggleSort('client')}
                  />
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3 text-right">Champs</th>
                  <Th
                    label="Statut"
                    active={sort.key === 'statut'}
                    dir={sort.dir}
                    onClick={() => toggleSort('statut')}
                  />
                  <Th
                    label="Date"
                    active={sort.key === 'date'}
                    dir={sort.dir}
                    onClick={() => toggleSort('date')}
                  />
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((prop) => (
                  <tr
                    key={prop.id}
                    onClick={() => goToDetail(prop.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {prop.clientName || 'Sans nom'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {prop.templateNom || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {prop.fieldsCount || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {prop.statut === 'exported' ? (
                        <StatutCommercialSelect
                          propositionId={prop.id}
                          value={prop.statutCommercial}
                        />
                      ) : (
                        <PropositionStatusBadge statut={prop.statut} />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDate(prop.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <PropositionNotesActions propositionId={prop.id} initialCount={prop.notesCount} />
                        {RESUMABLE.includes(prop.statut) && (
                          <Link
                            href={`/propositions/${prop.id}/resume`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                          >
                            <Clock className="h-3.5 w-3.5" />
                            Reprendre
                          </Link>
                        )}
                        <PropositionRowMenu propositionId={prop.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes (mobile) */}
          <div className="space-y-3 md:hidden">
            {visible.map((prop) => (
              <div
                key={prop.id}
                onClick={() => goToDetail(prop.id)}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {prop.clientName || 'Sans nom'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {prop.templateNom || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <PropositionNotesActions propositionId={prop.id} initialCount={prop.notesCount} />
                    <PropositionRowMenu propositionId={prop.id} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {prop.statut === 'exported' ? (
                    <StatutCommercialSelect
                      propositionId={prop.id}
                      value={prop.statutCommercial}
                    />
                  ) : (
                    <PropositionStatusBadge statut={prop.statut} />
                  )}
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(prop.createdAt)}
                  </span>
                </div>
                {RESUMABLE.includes(prop.statut) && (
                  <Link
                    href={`/propositions/${prop.id}/resume`}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Reprendre
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Th({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-700',
          active ? 'text-slate-700' : 'text-slate-500',
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}
