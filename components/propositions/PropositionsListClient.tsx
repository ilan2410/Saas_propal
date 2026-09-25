'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Clock,
  Paperclip,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/formatting';
import { cn } from '@/lib/utils';
import {
  getStatutCommercial,
  getStatutTechnique,
  STATUT_COMMERCIAL_ORDRE,
  STATUT_TECHNIQUE_ORDRE,
  type StatutCommercial,
} from '@/lib/propositions/status';
import {
  DEFAULT_PROPOSITION_COLUMNS,
  PROPOSITION_OPTIONAL_COLUMNS,
  type PropositionOptionalColumn,
} from '@/lib/propositions/list-preferences';
import { PropositionStatusBadge } from '@/components/propositions/PropositionStatusBadge';
import { StatutCommercialSelect } from '@/components/propositions/StatutCommercialSelect';
import { PropositionRowMenu } from '@/components/propositions/PropositionRowMenu';
import { PropositionNotesActions } from '@/components/propositions/PropositionNotesActions';
import { EditableClientName } from '@/components/propositions/EditableClientName';
import { TeleprospecteurSelect, type TeleprospecteurOption } from '@/components/propositions/TeleprospecteurSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type PropositionListItem = {
  id: string;
  statut: string;
  statutCommercial: StatutCommercial;
  templateNom: string;
  clientName: string;
  fieldsCount: number;
  notesCount: number;
  creatorId: string | null;
  creatorName: string;
  teleproId: string | null;
  teleproName: string;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
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
type SortKey = 'client' | 'statut' | 'createdAt' | 'updatedAt' | 'team' | 'telepro';
type SortDir = 'asc' | 'desc';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'toutes', label: 'Toutes' },
  { key: 'brouillons', label: 'Brouillons' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'en_attente_client', label: 'En attente client' },
  { key: 'signee', label: 'Signées' },
  { key: 'perdue', label: 'Perdues' },
];

const COLUMN_LABELS: Record<PropositionOptionalColumn, string> = {
  team: 'Équipe',
  telepro: 'Télépros',
  template: 'Template',
  fields: 'Champs',
  status: 'Statut',
  createdAt: 'Date de création',
  updatedAt: 'Dernière modification',
  attachments: 'Pièces jointes',
};

const RESUMABLE = ['draft', 'ready', 'extracted'];

// Normalise pour une recherche insensible à la casse et aux accents.
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

function matchesFilter(prop: PropositionListItem, filter: FilterKey): boolean {
  if (filter === 'toutes') return true;
  if (filter === 'brouillons') return prop.statut !== 'exported';
  return prop.statut === 'exported' && prop.statutCommercial === filter;
}

// Rang pour le tri « Statut » : non-exportées d'abord (ordre technique),
// puis exportées par ordre de statut commercial.
function statutRank(prop: PropositionListItem): number {
  if (prop.statut !== 'exported') return STATUT_TECHNIQUE_ORDRE[prop.statut] ?? 2;
  return 100 + (STATUT_COMMERCIAL_ORDRE[prop.statutCommercial] ?? 0);
}

function noteStatusLabel(prop: PropositionListItem): string {
  return prop.statut === 'exported'
    ? getStatutCommercial(prop.statutCommercial).label
    : getStatutTechnique(prop.statut).label;
}

export function PropositionsListClient({
  propositions,
  counts,
  teleproOptions,
  initialColumns,
  canManageTelepros,
}: {
  propositions: PropositionListItem[];
  counts: PropositionCounts;
  teleproOptions: TeleprospecteurOption[];
  initialColumns: PropositionOptionalColumn[];
  canManageTelepros: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(propositions);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('toutes');
  const [teamFilters, setTeamFilters] = useState<string[]>([]);
  const [teleproFilters, setTeleproFilters] = useState<string[]>([]);
  const [columns, setColumns] = useState<PropositionOptionalColumn[]>(initialColumns);
  const [savingColumns, setSavingColumns] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'updatedAt', dir: 'desc' });

  useEffect(() => setRows(propositions), [propositions]);

  const teamOptions = useMemo(() => {
    const names = new Map<string, string>();
    rows.forEach((row) => names.set(row.creatorId ?? 'unassigned', row.creatorName));
    return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [rows]);

  const filterTelepros = useMemo(() => {
    const names = new Map(teleproOptions.map((option) => [option.id, option.name]));
    rows.forEach((row) => { if (row.teleproId) names.set(row.teleproId, row.teleproName || 'Télépro'); });
    return [{ id: 'unassigned', name: 'Non assigné' }, ...[...names].map(([id, name]) => ({ id, name }))];
  }, [rows, teleproOptions]);

  const visible = useMemo(() => {
    const q = normalize(query);
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    const filtered = rows.filter((prop) => {
      if (!matchesFilter(prop, filter)) return false;
      if (teamFilters.length && !teamFilters.includes(prop.creatorId ?? 'unassigned')) return false;
      if (teleproFilters.length && !teleproFilters.includes(prop.teleproId ?? 'unassigned')) return false;
      if (!terms.length) return true;
      const haystack = normalize([
        prop.clientName,
        prop.templateNom,
        prop.creatorName,
        prop.teleproName,
        getStatutTechnique(prop.statut).label,
        formatDate(prop.createdAt),
        formatDate(prop.updatedAt),
      ].join(' '));
      return terms.every((term) => haystack.includes(term));
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'client') cmp = normalize(a.clientName).localeCompare(normalize(b.clientName));
      else if (sort.key === 'statut') cmp = statutRank(a) - statutRank(b);
      else if (sort.key === 'team') cmp = normalize(a.creatorName).localeCompare(normalize(b.creatorName));
      else if (sort.key === 'telepro') cmp = normalize(a.teleproName).localeCompare(normalize(b.teleproName));
      else cmp = new Date(a[sort.key]).getTime() - new Date(b[sort.key]).getTime();
      if (cmp === 0) cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return cmp * dir;
    });
  }, [rows, query, filter, teamFilters, teleproFilters, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((previous) => previous.key === key
      ? { key, dir: previous.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc' });
  };

  const saveColumns = async (next: PropositionOptionalColumn[]) => {
    const previous = columns;
    setColumns(next);
    setSavingColumns(true);
    try {
      const response = await fetch('/api/preferences/propositions-columns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible');
    } catch (error) {
      setColumns(previous);
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible');
    } finally {
      setSavingColumns(false);
    }
  };

  const hasColumn = (column: PropositionOptionalColumn) => columns.includes(column);
  const goToDetail = (id: string) => router.push(`/propositions/${id}`);
  const updateRow = (id: string, updates: Partial<PropositionListItem>) => {
    setRows((previous) => previous.map((row) => row.id === id ? { ...row, ...updates, updatedAt: new Date().toISOString() } : row));
  };

  return (
    <div className="space-y-4">
      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', filter === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
              {label}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', filter === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap">
          <MultiFilter label="Équipe" options={teamOptions} values={teamFilters} onChange={setTeamFilters} />
          <MultiFilter label="Télépros" options={filterTelepros} values={teleproFilters} onChange={setTeleproFilters} />
          <div className="relative min-w-[180px] flex-1 xl:w-56 xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Effacer la recherche"><X className="h-4 w-4" /></button>}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50" aria-label="Configurer les colonnes">
                <Settings2 className={cn('h-4 w-4', savingColumns && 'animate-spin')} />
                <span className="hidden sm:inline">Colonnes</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 border-slate-200 bg-white p-2">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Colonnes affichées</p>
              {PROPOSITION_OPTIONAL_COLUMNS.map((column) => (
                <button key={column} type="button" onClick={() => void saveColumns(hasColumn(column) ? columns.filter((item) => item !== column) : [...columns, column])} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100">
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded border', hasColumn(column) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300')}>
                    {hasColumn(column) && <Check className="h-3 w-3" />}
                  </span>
                  {COLUMN_LABELS[column]}
                </button>
              ))}
              <button type="button" onClick={() => void saveColumns([...DEFAULT_PROPOSITION_COLUMNS])} className="mt-1 w-full border-t border-slate-100 px-2 pt-2 text-left text-xs font-medium text-slate-500 hover:text-slate-800">Réinitialiser</button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"><p className="text-sm text-slate-500">Aucune proposition ne correspond à ces critères.</p></div>
      ) : (
        <>
          {/* Tableau (desktop) */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white lg:block">
            <table className="w-full table-fixed text-[13px]">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <Th label="Client" active={sort.key === 'client'} dir={sort.dir} onClick={() => toggleSort('client')} />
                {hasColumn('team') && <Th label="Équipe" className="w-[9%]" active={sort.key === 'team'} dir={sort.dir} onClick={() => toggleSort('team')} />}
                {hasColumn('telepro') && <Th label="Télépros" className="w-[15%]" active={sort.key === 'telepro'} dir={sort.dir} onClick={() => toggleSort('telepro')} />}
                {hasColumn('template') && <th className="w-[11%] px-3 py-2">Template</th>}
                {hasColumn('fields') && <th className="w-[6%] px-3 py-2 text-right">Champs</th>}
                {hasColumn('status') && <Th label="Statut" className="w-[13%]" active={sort.key === 'statut'} dir={sort.dir} onClick={() => toggleSort('statut')} />}
                {hasColumn('createdAt') && <Th label="Créée le" className="w-[9%]" active={sort.key === 'createdAt'} dir={sort.dir} onClick={() => toggleSort('createdAt')} />}
                {hasColumn('updatedAt') && <Th label="Modifiée le" className="w-[9%]" active={sort.key === 'updatedAt'} dir={sort.dir} onClick={() => toggleSort('updatedAt')} />}
                {hasColumn('attachments') && <th className="w-[5%] px-3 py-2 text-center" title="Pièces jointes">PJ</th>}
                <th className="w-[150px] px-3 py-2 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((prop) => (
                  <tr key={prop.id} onClick={() => goToDetail(prop.id)} className="cursor-pointer transition-colors hover:bg-slate-50">
                    <td className="truncate px-3 py-2 font-medium text-slate-900"><EditableClientName propositionId={prop.id} value={prop.clientName || 'Sans nom'} onSaved={(clientName) => updateRow(prop.id, { clientName })} /></td>
                    {hasColumn('team') && <td className="truncate px-3 py-2 text-slate-600" title={prop.creatorName}>{prop.creatorName}</td>}
                    {hasColumn('telepro') && <td className="px-3 py-2"><TeleprospecteurSelect propositionId={prop.id} value={prop.teleproId} options={teleproOptions} canCreate={canManageTelepros} onChanged={(teleproId, option) => updateRow(prop.id, { teleproId, teleproName: option?.name ?? '' })} /></td>}
                    {hasColumn('template') && <td className="truncate px-3 py-2 text-slate-500" title={prop.templateNom || undefined}>{prop.templateNom || '—'}</td>}
                    {hasColumn('fields') && <td className="px-3 py-2 text-right text-slate-500">{prop.fieldsCount || '—'}</td>}
                    {hasColumn('status') && <td className="whitespace-nowrap px-3 py-2">{prop.statut === 'exported' ? <StatutCommercialSelect propositionId={prop.id} value={prop.statutCommercial} /> : <PropositionStatusBadge statut={prop.statut} />}</td>}
                    {hasColumn('createdAt') && <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDate(prop.createdAt)}</td>}
                    {hasColumn('updatedAt') && <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDate(prop.updatedAt)}</td>}
                    {hasColumn('attachments') && <td className="px-3 py-2 text-center"><span className="inline-flex items-center gap-1 text-xs text-slate-500"><Paperclip className="h-3.5 w-3.5" />{prop.attachmentsCount}</span></td>}
                    <td className="px-3 py-2"><div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <PropositionNotesActions propositionId={prop.id} initialCount={prop.notesCount} titleContext={{ client: prop.clientName, template: prop.templateNom, statut: noteStatusLabel(prop) }} />
                      {RESUMABLE.includes(prop.statut) && <Link href={`/propositions/${prop.id}/resume`} onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"><Clock className="h-3.5 w-3.5" />Reprendre</Link>}
                      <PropositionRowMenu propositionId={prop.id} onAttachmentCountChange={(attachmentsCount) => updateRow(prop.id, { attachmentsCount })} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes (mobile / tablette) */}
          <div className="space-y-3 lg:hidden">
            {visible.map((prop) => (
              <div key={prop.id} onClick={() => goToDetail(prop.id)} className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><EditableClientName propositionId={prop.id} value={prop.clientName || 'Sans nom'} className="font-medium text-slate-900" onSaved={(clientName) => updateRow(prop.id, { clientName })} /><p className="mt-0.5 truncate text-xs text-slate-500">{prop.templateNom || '—'}</p></div>
                  <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}><PropositionNotesActions propositionId={prop.id} initialCount={prop.notesCount} titleContext={{ client: prop.clientName, template: prop.templateNom, statut: noteStatusLabel(prop) }} /><PropositionRowMenu propositionId={prop.id} onAttachmentCountChange={(attachmentsCount) => updateRow(prop.id, { attachmentsCount })} /></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">{prop.statut === 'exported' ? <StatutCommercialSelect propositionId={prop.id} value={prop.statutCommercial} /> : <PropositionStatusBadge statut={prop.statut} />}<span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-400"><Calendar className="h-3 w-3" />{formatDate(prop.updatedAt)}</span></div>
                {(hasColumn('team') || hasColumn('telepro')) && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs"><div><p className="text-slate-400">Équipe</p><p className="mt-0.5 truncate text-slate-600">{prop.creatorName}</p></div><div onClick={(event) => event.stopPropagation()}><p className="text-slate-400">Télépro</p><div className="mt-1"><TeleprospecteurSelect propositionId={prop.id} value={prop.teleproId} options={teleproOptions} canCreate={canManageTelepros} onChanged={(teleproId, option) => updateRow(prop.id, { teleproId, teleproName: option?.name ?? '' })} /></div></div></div>}
                {RESUMABLE.includes(prop.statut) && <Link href={`/propositions/${prop.id}/resume`} onClick={(event) => event.stopPropagation()} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"><Clock className="h-3.5 w-3.5" />Reprendre</Link>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MultiFilter({ label, options, values, onChange }: { label: string; options: { id: string; name: string }[]; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm transition-colors hover:bg-slate-50', values.length ? 'border-slate-400 text-slate-800' : 'border-slate-200 text-slate-600')}>{label}{values.length > 0 && <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{values.length}</span>}<ChevronDown className="h-3.5 w-3.5" /></button></PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto border-slate-200 bg-white p-2">
        {options.map((option) => {
          const selected = values.includes(option.id);
          return <button key={option.id} type="button" onClick={() => onChange(selected ? values.filter((value) => value !== option.id) : [...values, option.id])} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"><span className={cn('flex h-4 w-4 items-center justify-center rounded border', selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300')}>{selected && <Check className="h-3 w-3" />}</span><span className="truncate">{option.name}</span></button>;
        })}
        {values.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1 w-full border-t border-slate-100 px-2 pt-2 text-left text-xs font-medium text-slate-500 hover:text-slate-800">Effacer le filtre</button>}
      </PopoverContent>
    </Popover>
  );
}

function Th({ label, className, active, dir, onClick }: { label: string; className?: string; active: boolean; dir: SortDir; onClick: () => void }) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return <th className={cn('px-3 py-2', className)}><button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-slate-700', active ? 'text-slate-700' : 'text-slate-500')}>{label}<Icon className="h-3.5 w-3.5" /></button></th>;
}
