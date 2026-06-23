'use client';

import { useMemo, useState } from 'react';
import { ShoppingCart, ChevronDown, ChevronUp, Pencil, Trash2, Plus, Search, X } from 'lucide-react';
import type {
  CatalogueProduit,
  SpConfigLoyer,
  SpConfigModeClient,
  SpConfigMoisOfferts,
  SpQuestion,
  SpQuestionReponse,
  SpPreferencesProduits,
} from '@/types';
import { calculateCartSummary, buildLoopLabelsByGroup, type CartLine } from '@/lib/sp/calculateCart';
import { formatEuro } from '@/lib/sp/calculLoyer';
import { normalizePhoneNumber, maskPhoneInput } from '@/lib/utils/formatting';

const TELECOM_CATEGORIES = new Set(['fixe', 'mobile']);

function genUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Numéros de ligne existants de la SA (pour datalist du champ numéro). */
function getSaNumeros(donneesExtraites?: Record<string, unknown>): string[] {
  const sa = donneesExtraites?.situation_actuelle;
  if (!sa || typeof sa !== 'object') return [];
  const out = new Set<string>();
  for (const key of ['lignes', 'abonnements']) {
    const arr = (sa as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item && typeof item === 'object') {
        const num = (item as Record<string, unknown>).numero_ligne;
        if (typeof num === 'string' && num.trim()) out.add(num.trim());
      }
    }
  }
  return [...out];
}

interface SpRealTimeCartProps {
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  catalogue: CatalogueProduit[];
  donneesExtraites?: Record<string, unknown>;
  spConfigLoyer?: SpConfigLoyer;
  spConfigMoisOfferts?: SpConfigMoisOfferts;
  spPreferencesProduits?: SpPreferencesProduits;
  modeClientActif?: boolean;
  spConfigModeClient?: SpConfigModeClient;
  onUpdateReponses?: (reponses: SpQuestionReponse[]) => void;
}

function parseJsonMap(value: SpQuestionReponse['valeur']): Record<string, string> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = String(v);
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function setReponseMapValue(
  reponses: SpQuestionReponse[],
  questionId: string,
  key: string,
  value: number,
): SpQuestionReponse[] {
  const existing = reponses.find((r) => r.question_id === questionId);
  const currentMap: Record<string, string> = existing ? (parseJsonMap(existing.valeur) ?? {}) : {};
  currentMap[key] = String(value);
  const newValeur = JSON.stringify(currentMap);
  if (existing) {
    return reponses.map((r) => (r.question_id === questionId ? { ...r, valeur: newValeur } : r));
  }
  return [...reponses, { question_id: questionId, valeur: newValeur }];
}

function setReponseMapStringValue(
  reponses: SpQuestionReponse[],
  questionId: string,
  key: string,
  value: string,
): SpQuestionReponse[] {
  const existing = reponses.find((r) => r.question_id === questionId);
  const currentMap: Record<string, string> = existing ? (parseJsonMap(existing.valeur) ?? {}) : {};
  currentMap[key] = value;
  const newValeur = JSON.stringify(currentMap);
  if (existing) {
    return reponses.map((r) => (r.question_id === questionId ? { ...r, valeur: newValeur } : r));
  }
  return [...reponses, { question_id: questionId, valeur: newValeur }];
}

function Line({
  label,
  value,
  suffix,
  bold,
  muted,
}: {
  label: string;
  value: number;
  suffix?: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-xs ${
        bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {formatEuro(value)}
        {suffix && <span className="ml-0.5 text-[10px] text-gray-400">{suffix}</span>}
      </span>
    </div>
  );
}

function EditInput({
  value,
  onChange,
  min,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min ?? 0}
      step={step ?? 1}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-16 rounded border border-blue-300 bg-blue-50 px-1 py-0.5 text-[11px] text-blue-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function DetailRow({
  line,
  suffix,
  mode = 'price',
  editMode,
  saNumeros,
  usedNumeroDigits,
  onUpdate,
  onUpdateNumero,
  onDelete,
}: {
  line: CartLine;
  suffix?: string;
  mode?: 'price' | 'fas';
  editMode?: boolean;
  saNumeros?: string[];
  usedNumeroDigits?: Set<string>;
  onUpdate?: (field: 'prix' | 'quantite' | 'fas', value: number) => void;
  onUpdateNumero?: (numero: string) => void;
  onDelete?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const qty = line.quantite > 0 ? line.quantite : 1;
  const prixUnitaire = line.prixTotal / qty;
  const headerAmount = mode === 'fas' ? line.fasTotal : line.prixTotal;
  const headerSuffix = mode === 'fas' ? undefined : suffix;
  const canEdit = editMode && mode !== 'fas';
  const isTelecom = TELECOM_CATEGORIES.has(line.categorie);
  const numeroListId = `sa-numeros-${line.instanceId}-${line.produitId ?? line.produitNom}`;
  // Numéros SA encore disponibles : on exclut ceux déjà rattachés à un autre
  // produit, mais on conserve toujours le numéro propre à cette ligne.
  const ownDigits = (line.numero ?? '').replace(/\D/g, '');
  const availableNumeros = (saNumeros ?? []).filter((n) => {
    const d = n.replace(/\D/g, '');
    return d === ownDigits || !usedNumeroDigits?.has(d);
  });

  return (
    <div className="flex flex-col gap-0.5 py-0.5 border-l-2 border-gray-100 pl-2">
      <div className="flex items-start justify-between gap-2 text-[11px] text-gray-700">
        <span className="min-w-0 flex items-center gap-1">
          <span className="truncate" title={line.produitNom}>
            {line.produitNom}
          </span>
          {line.numero && (
            <span
              className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-medium text-purple-700"
              title={`Numéro : ${line.numero}`}
            >
              {line.numero}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="tabular-nums text-gray-600">
            {formatEuro(headerAmount)}
            {headerSuffix && <span className="ml-0.5 text-[9px] text-gray-400">{headerSuffix}</span>}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsEditing((v) => !v); }}
              title={isEditing ? 'Fermer' : 'Éditer'}
              className={`rounded p-0.5 transition-colors hover:bg-gray-100 ${
                isEditing ? 'text-blue-500' : 'text-gray-300 hover:text-gray-500'
              }`}
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
          {canEdit && onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Supprimer le produit"
              className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-1 flex flex-col gap-1 border-l-2 border-blue-200 pl-2">
          <div className="flex items-center justify-between gap-1 text-[10px] text-gray-500">
            <span>Prix{suffix ? ` (${suffix})` : ''}</span>
            {/* calculateCart expects the TOTAL (unit × qty) as override */}
            <EditInput
              value={prixUnitaire}
              step={0.01}
              onChange={(v) => onUpdate?.('prix', v * qty)}
            />
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] text-gray-500">
            <span>Quantité</span>
            <EditInput
              value={qty}
              min={1}
              step={1}
              onChange={(v) => onUpdate?.('quantite', Math.max(1, Math.round(v)))}
            />
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] text-gray-500">
            <span>FAS</span>
            <EditInput
              value={line.fasTotal}
              step={0.01}
              onChange={(v) => onUpdate?.('fas', v)}
            />
          </div>
          {isTelecom && onUpdateNumero && (
            <div className="flex items-center justify-between gap-1 text-[10px] text-gray-500">
              <span>Numéro</span>
              <input
                type="text"
                inputMode="tel"
                list={numeroListId}
                defaultValue={line.numero ?? ''}
                placeholder="06 12 34 56 78"
                maxLength={20}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.currentTarget.value = maskPhoneInput(e.currentTarget.value); }}
                onBlur={(e) => onUpdateNumero(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-28 rounded border border-blue-300 bg-blue-50 px-1 py-0.5 text-[11px] text-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {availableNumeros.length > 0 && (
                <datalist id={numeroListId}>
                  {availableNumeros.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
          <span className="tabular-nums">
            {formatEuro(prixUnitaire)}
            {suffix && <span className="ml-0.5">{suffix}</span>}
            <span className="mx-1">×</span>
            {qty}
          </span>
          {mode !== 'fas' && line.fasTotal > 0 && (
            <span className="tabular-nums">
              FAS&nbsp;{formatEuro(line.fasTotal)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface CategoryAccordionProps {
  label: string;
  total: number;
  suffix?: string;
  bold?: boolean;
  muted?: boolean;
  detailSuffix?: string;
  detailMode?: 'price' | 'fas';
  lines: CartLine[];
  expanded: boolean;
  onToggle: () => void;
  editMode?: boolean;
  saNumeros?: string[];
  usedNumeroDigits?: Set<string>;
  onUpdateLine?: (
    instanceId: string,
    produitNom: string,
    produitId: string | undefined,
    field: 'prix' | 'quantite' | 'fas',
    value: number,
  ) => void;
  onUpdateNumero?: (line: CartLine, numero: string) => void;
  onDeleteLine?: (line: CartLine) => void;
}

function CategoryAccordion({
  label,
  total,
  suffix,
  bold,
  muted,
  detailSuffix,
  detailMode = 'price',
  lines,
  expanded,
  onToggle,
  editMode,
  saNumeros,
  usedNumeroDigits,
  onUpdateLine,
  onUpdateNumero,
  onDeleteLine,
}: CategoryAccordionProps) {
  const hasDetails = lines.length > 0;
  if (!hasDetails) {
    return <Line label={label} value={total} suffix={suffix} bold={bold} muted={muted} />;
  }
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-xs hover:bg-gray-50 -mx-1 px-1 py-0.5 rounded"
      >
        <span
          className={`flex items-center gap-1 ${
            bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
          }`}
        >
          <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          {label}
        </span>
        <span
          className={`tabular-nums ${
            bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
          }`}
        >
          {formatEuro(total)}
          {suffix && <span className="ml-0.5 text-[10px] text-gray-400">{suffix}</span>}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 ml-3 space-y-1">
          {lines.map((l) => (
            <DetailRow
              key={l.instanceId + l.produitNom}
              line={l}
              suffix={detailSuffix ?? suffix}
              mode={detailMode}
              editMode={editMode}
              saNumeros={saNumeros}
              usedNumeroDigits={usedNumeroDigits}
              onUpdate={(field, value) =>
                onUpdateLine?.(l.instanceId, l.produitNom, l.produitId, field, value)
              }
              onUpdateNumero={onUpdateNumero ? (numero) => onUpdateNumero(l, numero) : undefined}
              onDelete={onDeleteLine ? () => onDeleteLine(l) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpRealTimeCart({
  reponses,
  questions,
  catalogue,
  donneesExtraites,
  spConfigLoyer,
  spConfigMoisOfferts,
  spPreferencesProduits,
  modeClientActif,
  spConfigModeClient,
  onUpdateReponses,
}: SpRealTimeCartProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const clientEditMode = !!(modeClientActif && spConfigModeClient?.permettre_edition_panier_client);
  // Le commercial (hors mode client) peut toujours éditer/ajouter/supprimer ;
  // en mode client, uniquement si l'édition du panier est autorisée.
  const editMode = !modeClientActif || clientEditMode;

  const saNumeros = useMemo(() => {
    const fromSa = getSaNumeros(donneesExtraites);
    const reponsesWithoutEdits = reponses.filter((r) => !r.question_id.startsWith('loop_label__'));
    const originalLabels = buildLoopLabelsByGroup(questions, reponsesWithoutEdits, donneesExtraites ?? {});
    const finalLabels = buildLoopLabelsByGroup(questions, reponses, donneesExtraites ?? {});
    const out = new Set<string>(fromSa);
    // Retire les labels originaux des boucles (ils viennent déjà des données SA)
    for (const labels of originalLabels.values()) {
      for (const label of labels) {
        if (label.trim()) out.delete(label.trim());
      }
    }
    // Ajoute les labels finaux (intègre les modifications utilisateur)
    for (const labels of finalLabels.values()) {
      for (const label of labels) {
        if (label.trim()) out.add(label.trim());
      }
    }
    return [...out].map(normalizePhoneNumber);
  }, [donneesExtraites, questions, reponses]);

  const toggleCat = (key: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const summary = useMemo(
    () =>
      calculateCartSummary(
        reponses,
        questions,
        catalogue,
        donneesExtraites ?? {},
        spConfigLoyer,
        spConfigMoisOfferts,
        spPreferencesProduits,
      ),
    [reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits],
  );

  const grouped = useMemo(() => {
    const acc = {
      fixe: [] as CartLine[],
      mobile: [] as CartLine[],
      internet: [] as CartLine[],
      autresMensuels: [] as CartLine[],
      equipement: [] as CartLine[],
      cadeau: [] as CartLine[],
      installation: [] as CartLine[],
      autresPonctuels: [] as CartLine[],
      fas: [] as CartLine[],
    };
    for (const l of summary.lines) {
      if (l.fasTotal > 0) acc.fas.push(l);
      if (l.type_frequence === 'mensuel') {
        if (l.categorie === 'fixe') acc.fixe.push(l);
        else if (l.categorie === 'mobile') acc.mobile.push(l);
        else if (l.categorie === 'internet') acc.internet.push(l);
        else acc.autresMensuels.push(l);
      } else {
        if (l.categorie === 'equipement') acc.equipement.push(l);
        else if (l.categorie === 'cadeau') acc.cadeau.push(l);
        else if (l.categorie === 'installation') acc.installation.push(l);
        else acc.autresPonctuels.push(l);
      }
    }
    return acc;
  }, [summary.lines]);

  // Chiffres des numéros déjà rattachés à un produit (pour filtrer la liste SA).
  const usedNumeroDigits = useMemo(() => {
    const s = new Set<string>();
    for (const l of summary.lines) {
      const d = (l.numero ?? '').replace(/\D/g, '');
      if (d) s.add(d);
    }
    return s;
  }, [summary.lines]);

  const handleUpdateLine = (
    instanceId: string,
    produitNom: string,
    produitId: string | undefined,
    field: 'prix' | 'quantite' | 'fas',
    value: number,
  ) => {
    const questionId = `${field}_${instanceId}`;
    const key = field === 'prix' ? (produitId ?? produitNom) : produitNom;
    let updated = setReponseMapValue(reponses, questionId, key, value);

    if (field === 'quantite') {
      const currentLine = summary.lines.find((l) =>
        l.instanceId === instanceId &&
        (l.produitId === produitId || l.produitNom === produitNom)
      );
      if (currentLine) {
        const currentQty = currentLine.quantite > 0 ? currentLine.quantite : 1;
        const unitPrice = currentLine.prixTotal / currentQty;
        updated = setReponseMapValue(
          updated,
          `prix_${instanceId}`,
          produitId ?? produitNom,
          unitPrice * value,
        );
      }
    }

    onUpdateReponses?.(updated);
  };

  const handleUpdateNumero = (line: CartLine, numero: string) => {
    const updated = setReponseMapStringValue(
      reponses,
      `numero_${line.instanceId}`,
      line.produitId ?? line.produitNom,
      normalizePhoneNumber(numero),
    );
    onUpdateReponses?.(updated);
  };

  // Ajoute / retire une ligne auto-injectée (préférences) de la liste d'exclusion.
  const excludeAutoLine = (instanceId: string): SpQuestionReponse[] => {
    const existing = reponses.find((r) => r.question_id === 'auto_exclu');
    let list: string[] = [];
    if (existing && typeof existing.valeur === 'string') {
      try {
        const parsed = JSON.parse(existing.valeur);
        if (Array.isArray(parsed)) list = parsed.map(String);
      } catch {
        /* ignore */
      }
    }
    if (!list.includes(instanceId)) list.push(instanceId);
    const valeur = JSON.stringify(list);
    if (existing) {
      return reponses.map((r) => (r.question_id === 'auto_exclu' ? { ...r, valeur } : r));
    }
    return [...reponses, { question_id: 'auto_exclu', valeur }];
  };

  const handleDeleteLine = (line: CartLine) => {
    const iid = line.instanceId;

    // Lignes auto-injectées (préférences) → exclusion persistante.
    if (iid.startsWith('auto_')) {
      onUpdateReponses?.(excludeAutoLine(iid));
      return;
    }

    // Auxiliaires à retirer quand on supprime entièrement une réponse.
    const auxIds = new Set([
      `quantite_${iid}`,
      `prix_${iid}`,
      `fas_${iid}`,
      `numero_${iid}`,
      `libre_${iid}`,
      `options_${iid}`,
    ]);

    let next = [...reponses];
    const rep = next.find((r) => r.question_id === iid);

    if (iid.startsWith('manual_')) {
      next = next.filter((r) => r.question_id !== iid && !auxIds.has(r.question_id));
      onUpdateReponses?.(next);
      return;
    }

    if (iid.startsWith('options_')) {
      // Retirer l'option (par id ou nom) du tableau ; supprimer la réponse si vide.
      if (rep) {
        const arr = Array.isArray(rep.valeur)
          ? rep.valeur.map(String)
          : typeof rep.valeur === 'string'
            ? (() => { try { const p = JSON.parse(rep.valeur as string); return Array.isArray(p) ? p.map(String) : [String(rep.valeur)]; } catch { return [String(rep.valeur)]; } })()
            : [];
        const filtered = arr.filter((v) => v !== line.produitId && v !== line.produitNom);
        if (filtered.length === 0) {
          next = next.filter((r) => r.question_id !== iid);
        } else {
          next = next.map((r) => (r.question_id === iid ? { ...r, valeur: JSON.stringify(filtered) } : r));
        }
      }
      onUpdateReponses?.(next);
      return;
    }

    // Détecte une ligne issue d'une saisie libre : le tableau de réponse contient
    // le marqueur '__libre__' et le label est stocké dans `libre_<iid>`.
    const libreRep = next.find((r) => r.question_id === `libre_${iid}`);
    let isLibreLine = false;
    if (libreRep && typeof libreRep.valeur === 'string') {
      try {
        const parsed = JSON.parse(libreRep.valeur);
        isLibreLine = parsed?.label === line.produitNom;
      } catch {
        /* ignore */
      }
    }
    const removeToken = isLibreLine ? '__libre__' : line.produitNom;

    // Réponse de question normale (choix unique/multiple ou saisie libre).
    if (rep && Array.isArray(rep.valeur)) {
      const filtered = rep.valeur.map(String).filter((v) => v !== removeToken);
      if (filtered.length === 0) {
        next = next.filter((r) => r.question_id !== iid && !auxIds.has(r.question_id));
      } else {
        next = next.map((r) => (r.question_id === iid ? { ...r, valeur: filtered } : r));
        if (isLibreLine) next = next.filter((r) => r.question_id !== `libre_${iid}`);
      }
    } else {
      // Valeur scalaire (choix unique / libre) → on retire la réponse + auxiliaires.
      next = next.filter((r) => r.question_id !== iid && !auxIds.has(r.question_id));
    }
    onUpdateReponses?.(next);
  };

  const handleAddProduct = (produit: CatalogueProduit) => {
    const uid = genUid();
    onUpdateReponses?.([
      ...reponses,
      { question_id: `manual_${uid}`, valeur: produit.id },
    ]);
    setSearch('');
    setAdding(false);
  };

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalogue
      .filter((p) => p.actif !== false)
      .filter((p) =>
        p.nom.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [search, catalogue]);

  const hasAnyLine = summary.lines.length > 0;
  const grandTotalMensuel = summary.loyer?.loyer_mensuel ?? summary.abonnements.totalMensuel;

  return (
    <div
      className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-xl"
      role="complementary"
      aria-label="Panier temps réel"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-white hover:from-blue-700 hover:to-blue-600 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4" />
          Situation Proposée
          {editMode && (
            <span className="text-[10px] font-normal opacity-80 bg-white/20 px-1.5 py-0.5 rounded-full">
              édition
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums opacity-90">
            {formatEuro(grandTotalMensuel)}
            <span className="opacity-70">/mois</span>
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {!hasAnyLine && (
            <p className="text-xs text-gray-400 italic">Aucun produit sélectionné pour l'instant.</p>
          )}

          {hasAnyLine && (
            <>
              {/* Abonnements */}
              <section className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Abonnements
                </p>
                <CategoryAccordion
                  label="Fixe"
                  total={summary.abonnements.fixe}
                  suffix="/mois"
                  lines={grouped.fixe}
                  expanded={expandedCats.has('fixe')}
                  onToggle={() => toggleCat('fixe')}
                  editMode={editMode}
                  onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                />
                <CategoryAccordion
                  label="Mobile"
                  total={summary.abonnements.mobile}
                  suffix="/mois"
                  lines={grouped.mobile}
                  expanded={expandedCats.has('mobile')}
                  onToggle={() => toggleCat('mobile')}
                  editMode={editMode}
                  onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                />
                <CategoryAccordion
                  label="Internet"
                  total={summary.abonnements.internet}
                  suffix="/mois"
                  lines={grouped.internet}
                  expanded={expandedCats.has('internet')}
                  onToggle={() => toggleCat('internet')}
                  editMode={editMode}
                  onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                />
                {grouped.autresMensuels.length > 0 && (
                  <CategoryAccordion
                    label="Autres"
                    total={summary.autresMensuels}
                    suffix="/mois"
                    muted
                    lines={grouped.autresMensuels}
                    expanded={expandedCats.has('autres_m')}
                    onToggle={() => toggleCat('autres_m')}
                    editMode={editMode}
                    onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                  />
                )}
                <div className="pt-1 border-t border-gray-100">
                  <Line label="Total mensuel" value={summary.abonnements.totalMensuel} suffix="/mois" bold />
                </div>
              </section>

              {/* Ponctuels */}
              {(grouped.equipement.length > 0 ||
                grouped.cadeau.length > 0 ||
                grouped.installation.length > 0 ||
                grouped.fas.length > 0 ||
                grouped.autresPonctuels.length > 0) && (
                <section className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Ponctuel
                  </p>
                  {grouped.equipement.length > 0 && (
                    <CategoryAccordion
                      label="Matériel"
                      total={summary.materiel}
                      lines={grouped.equipement}
                      expanded={expandedCats.has('equipement')}
                      onToggle={() => toggleCat('equipement')}
                      editMode={editMode}
                      onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                    />
                  )}
                  {grouped.cadeau.length > 0 && (
                    <CategoryAccordion
                      label="Cadeaux"
                      total={summary.cadeaux}
                      lines={grouped.cadeau}
                      expanded={expandedCats.has('cadeau')}
                      onToggle={() => toggleCat('cadeau')}
                      editMode={editMode}
                      onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                    />
                  )}
                  {grouped.installation.length > 0 && (
                    <CategoryAccordion
                      label="Installations"
                      total={summary.installations}
                      lines={grouped.installation}
                      expanded={expandedCats.has('installation')}
                      onToggle={() => toggleCat('installation')}
                      editMode={editMode}
                      onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                    />
                  )}
                  {grouped.fas.length > 0 && (
                    <CategoryAccordion
                      label="FAS"
                      total={summary.fas}
                      lines={grouped.fas}
                      detailMode="fas"
                      expanded={expandedCats.has('fas')}
                      onToggle={() => toggleCat('fas')}
                      editMode={editMode}
                      onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                    />
                  )}
                  {grouped.autresPonctuels.length > 0 && (
                    <CategoryAccordion
                      label="Autres"
                      total={summary.autresPonctuels}
                      muted
                      lines={grouped.autresPonctuels}
                      expanded={expandedCats.has('autres_p')}
                      onToggle={() => toggleCat('autres_p')}
                      editMode={editMode}
                      onUpdateLine={handleUpdateLine}
                  saNumeros={saNumeros}
                  usedNumeroDigits={usedNumeroDigits}
                  onUpdateNumero={handleUpdateNumero}
                  onDeleteLine={handleDeleteLine}
                    />
                  )}
                  <div className="pt-1 border-t border-gray-100">
                    <Line label="Total ponctuel" value={summary.totalPonctuel} bold />
                  </div>
                </section>
              )}

              {/* Loyer */}
              {summary.loyer && (
                <section className="space-y-1 rounded-lg bg-blue-50 border border-blue-100 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleCat('loyer_detail')}
                    className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-blue-600 hover:opacity-80"
                  >
                    <span className="flex items-center gap-1">
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${expandedCats.has('loyer_detail') ? '' : '-rotate-90'}`}
                      />
                      Loyer ({summary.loyer.duree_mois} mois)
                    </span>
                  </button>
                  {expandedCats.has('loyer_detail') && (
                    <div className="space-y-0.5 pt-1 border-t border-blue-100">
                      <Line label="Total ponctuel" value={summary.totalPonctuel} muted />
                      {summary.remiseMoisOffert > 0 && (
                        <Line label="Remise mois offert" value={summary.remiseMoisOffert} muted />
                      )}
                      {summary.indemnites > 0 && (
                        <Line label="Indemnités" value={summary.indemnites} muted />
                      )}
                      {summary.marge !== 0 &&
                        (summary.codePromo ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleCat('marge_promo')}
                              className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700"
                            >
                              <span className="flex items-center gap-1">
                                <ChevronDown
                                  className={`h-3 w-3 text-gray-400 transition-transform ${expandedCats.has('marge_promo') ? '' : '-rotate-90'}`}
                                />
                                Marge
                              </span>
                              <span className="tabular-nums">{formatEuro(summary.marge)}</span>
                            </button>
                            {expandedCats.has('marge_promo') && (
                              <div className="mt-1 ml-3 space-y-0.5 border-l-2 border-gray-100 pl-2">
                                <Line
                                  label="Marge avant code promo"
                                  value={summary.codePromo.margeAvant}
                                  muted
                                />
                                <div className="flex items-center justify-between text-[11px] text-emerald-700">
                                  <span>
                                    Code promo{' '}
                                    <span className="font-mono font-medium">{summary.codePromo.nom}</span>
                                  </span>
                                  <span className="tabular-nums">
                                    {summary.codePromo.mode === 'soustraction' ? '−' : '+'}
                                    {formatEuro(summary.codePromo.valeur)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <Line label="Marge" value={summary.marge} muted />
                        ))}
                      <Line label="Base loyer" value={summary.baseLoyer} bold />
                    </div>
                  )}
                  <Line label="Mensuel" value={summary.loyer.loyer_mensuel} suffix="/mois" bold />
                  <Line label="Trimestriel" value={summary.loyer.loyer_trimestriel} suffix="/trim" muted />
                </section>
              )}
            </>
          )}

          {/* Ajouter un produit depuis le catalogue */}
          {editMode && (
            <div className="pt-2 border-t border-gray-100">
              {!adding ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-blue-300 px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un produit
                </button>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                      <input
                        autoFocus
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un produit…"
                        className="w-full rounded border border-gray-300 bg-white pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAdding(false); setSearch(''); }}
                      title="Fermer"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {search.trim() && (
                    <div className="max-h-40 overflow-y-auto rounded border border-gray-100">
                      {searchResults.length === 0 ? (
                        <p className="px-2 py-1.5 text-[11px] italic text-gray-400">Aucun produit trouvé.</p>
                      ) : (
                        searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleAddProduct(p)}
                            className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-blue-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-gray-800">{p.nom}</span>
                              <span className="block truncate text-[9px] uppercase tracking-wide text-gray-400">
                                {p.categorie}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-gray-500">
                              {formatEuro(p.type_frequence === 'mensuel' ? (p.prix_mensuel ?? 0) : (p.prix_vente ?? 0))}
                              <span className="text-[9px] text-gray-400">{p.type_frequence === 'mensuel' ? '/mois' : ''}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
