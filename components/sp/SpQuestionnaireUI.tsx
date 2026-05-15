'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, User, ChevronLeft, ChevronRight, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpQuestion, SpQuestionReponse, SpAdresse, CatalogueProduit, SpFiltresCatalogue, SpConsequence } from '@/types';
import { evaluateQuestionVisibility, filterCatalogueByFiltre } from '@/lib/sp/evaluateConditions';

export interface SpQuestionnaireUIProps {
  questions: SpQuestion[];
  donneesExtraites: Record<string, unknown>;
  catalogue: CatalogueProduit[];
  fournisseurs: string[];
  onComplete: (reponses: SpQuestionReponse[]) => void;
  initialReponses?: SpQuestionReponse[];
  isSimulation?: boolean;
  siteLabel?: string;
  startFromQuestionId?: string;
}

type MessageBubble =
  | { from: 'bot'; text: string }
  | { from: 'user'; text: string };

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function formatSaTemplateValue(value: unknown): string {
  if (value == null) return 'Non renseigné';
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function resolveSaTemplateText(text: string, donneesExtraites: Record<string, unknown>): string {
  return text.replace(/\{\{(sa|count):([^}|]+)(?:\|([^}=]+)=([^}]+))?\}\}/g, (_match, type, path, filterField, filterValue) => {
    const cleanPath = String(path).trim();
    if (type === 'sa') return formatSaTemplateValue(getNestedValue(donneesExtraites, cleanPath));

    const value = getNestedValue(donneesExtraites, cleanPath);
    if (!Array.isArray(value)) return '0';
    const items = value.filter(
      (item): item is Record<string, unknown> => item != null && typeof item === 'object' && !Array.isArray(item),
    );
    if (!filterField || !filterValue) return String(items.length);
    const expected = String(filterValue).trim().toLowerCase();
    return String(items.filter((item) => String(item[String(filterField).trim()] ?? '').trim().toLowerCase() === expected).length);
  });
}

function getLoopItemsFromSa(
  donneesExtraites: Record<string, unknown>,
  sourceSaArray?: string,
  filtreChamp?: string,
  filtreValeur?: string,
): Record<string, unknown>[] {
  if (!sourceSaArray) return [];
  const value = getNestedValue(donneesExtraites, sourceSaArray);
  if (!Array.isArray(value)) return [];

  const items = value.filter(
    (item): item is Record<string, unknown> => item != null && typeof item === 'object' && !Array.isArray(item),
  );

  if (!filtreChamp || !filtreValeur) return items;

  const expected = filtreValeur.trim().toLowerCase();
  return items.filter((item) => String(item[filtreChamp] ?? '').trim().toLowerCase() === expected);
}

function formatReponseText(valeur: SpQuestionReponse['valeur']): string {
  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
  if (Array.isArray(valeur)) return valeur.join(', ');
  if (typeof valeur === 'object' && valeur !== null) {
    const a = valeur as SpAdresse;
    return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`].filter(Boolean).join(', ');
  }
  return String(valeur);
}

function remapReponsesForIteration(
  reponses: SpQuestionReponse[],
  allQuestions: SpQuestion[],
  groupeBoucleId: string,
  iterationIndex: number,
): SpQuestionReponse[] {
  const groupQuestionIds = new Set(
    allQuestions.filter((q) => q.groupe_boucle_id === groupeBoucleId).map((q) => q.id),
  );
  return reponses.map((r) => {
    const baseId = r.question_id.replace(/__iter_\d+$/, '');
    if (groupQuestionIds.has(baseId)) {
      const expectedId = `${baseId}__iter_${iterationIndex}`;
      if (r.question_id === expectedId) {
        return { ...r, question_id: baseId };
      }
      return { ...r, question_id: `__skip__${r.question_id}` };
    }
    return r;
  });
}

function formatPrixProduit(p: CatalogueProduit): string | null {
  if (p.type_frequence === 'mensuel' && p.prix_mensuel != null)
    return `${p.prix_mensuel.toFixed(2).replace('.', ',')} €/mois`;
  if (p.type_frequence === 'unique' && p.prix_vente != null)
    return `${p.prix_vente.toFixed(2).replace('.', ',')} €`;
  return null;
}

function getProduitPrixValue(p: CatalogueProduit): string {
  if (p.type_frequence === 'mensuel' && p.prix_mensuel != null) return p.prix_mensuel.toString();
  if (p.type_frequence === 'unique' && p.prix_vente != null) return p.prix_vente.toString();
  return '';
}

function getProduitPrixLabel(p: CatalogueProduit): string {
  return p.type_frequence === 'mensuel' ? 'Prix (€/mois)' : 'Prix (€)';
}

function formatProduitPrixValue(value: string, p: CatalogueProduit): string | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return p.type_frequence === 'mensuel'
    ? `${amount.toFixed(2).replace('.', ',')} €/mois`
    : `${amount.toFixed(2).replace('.', ',')} €`;
}

function formatProduitFasValue(value: string): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0,00 €';
  return `FAS ${amount.toFixed(2).replace('.', ',')} €`;
}

function shouldMultiplyFas(product: CatalogueProduit): boolean {
  return product.mode_fas === 'multiplie_par_quantite';
}

function getQuantityValue(value: string | number | undefined): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatProduitTotalValue(value: string, p: CatalogueProduit, quantity: string | number): string | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const total = amount * getQuantityValue(quantity);
  return p.type_frequence === 'mensuel'
    ? `${total.toFixed(2).replace('.', ',')} €/mois`
    : `${total.toFixed(2).replace('.', ',')} €`;
}

function formatProduitFasTotalValue(value: string, quantity: string | number): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'FAS 0,00 €';
  const total = amount * getQuantityValue(quantity);
  return `FAS ${total.toFixed(2).replace('.', ',')} €`;
}

function CatalogueMultipleChoiceInput({
  products,
  onSubmit,
  display = 'buttons',
}: {
  products: CatalogueProduit[];
  onSubmit: (selectedNames: string[], extraReponses?: SpQuestionReponse[]) => void;
  display?: 'buttons' | 'select';
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [fasValues, setFasValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => { init[p.nom] = p.prix_installation != null ? p.prix_installation.toString() : '0'; });
    return init;
  });
  const [prixValues, setPrixValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => { init[p.nom] = getProduitPrixValue(p); });
    return init;
  });
  const [quantityValues, setQuantityValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    products.forEach((p) => { init[p.nom] = '1'; });
    return init;
  });
  const [editingPrixFor, setEditingPrixFor] = useState<string | null>(null);

  const toggle = (nom: string) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(nom)) s.delete(nom);
      else s.add(nom);
      return s;
    });

  const selectedProducts = products.filter((p) => selected.has(p.nom));
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter((p) => [
      p.nom,
      p.fournisseur,
      p.categorie,
      p.description,
      ...(p.tags ?? []),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch)))
    : products;

  return (
    <div className="space-y-3">
      {display === 'select' ? (
        <div className="space-y-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="h-8 w-full text-sm border border-gray-300 rounded px-2 bg-white"
          />
          <div className="max-h-56 overflow-y-auto rounded border border-gray-300 bg-white p-1 space-y-1">
            {filteredProducts.map((p) => {
              const prix = formatPrixProduit(p);
              const fas = p.prix_installation != null ? `FAS: ${p.prix_installation.toFixed(2).replace('.', ',')} €` : null;
              const isSelected = selected.has(p.nom);
              return (
                <button
                  key={p.nom}
                  type="button"
                  onClick={() => toggle(p.nom)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    isSelected ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <div className="font-medium">{p.nom}</div>
                  {(prix || fas) && (
                    <div className={`text-xs ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                      {[prix, fas].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">Aucun produit trouvé</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {products.map((p) => {
            const prix = formatPrixProduit(p);
            const fas = p.prix_installation != null ? `FAS: ${p.prix_installation.toFixed(2).replace('.', ',')} €` : null;
            const isSelected = selected.has(p.nom);
            return (
              <button key={p.nom} type="button" onClick={() => toggle(p.nom)}
                className={`text-left px-3 py-2 rounded-md border transition-colors ${
                  isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                <div className="text-sm font-medium">{p.nom}</div>
                {(prix || fas) && (
                  <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                    {[prix, fas].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedProducts.length > 0 && (
        <div className="space-y-2 p-3 bg-white border border-gray-200 rounded-lg">
          {selectedProducts.map((p) => (
            <div key={p.nom} className="space-y-2 rounded-md border border-gray-100 px-2 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{p.nom}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Qté {getQuantityValue(quantityValues[p.nom])}
                </span>
                {formatProduitPrixValue(prixValues[p.nom] ?? '', p) && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Unitaire: {formatProduitPrixValue(prixValues[p.nom] ?? '', p)}
                  </span>
                )}
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Total: {formatProduitTotalValue(prixValues[p.nom] ?? '', p, quantityValues[p.nom]) ?? '0,00 €'}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {shouldMultiplyFas(p)
                    ? formatProduitFasTotalValue(fasValues[p.nom] ?? '0', quantityValues[p.nom])
                    : formatProduitFasValue(fasValues[p.nom] ?? '0')}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingPrixFor((current) => current === p.nom ? null : p.nom)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                  aria-label={`Modifier le prix et le FAS de ${p.nom}`}
                  title={`Modifier le prix et le FAS de ${p.nom}`}
                >
                  {editingPrixFor === p.nom ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">Quantité</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantityValues[p.nom] ?? '1'}
                  onChange={(e) => setQuantityValues((prev) => ({ ...prev, [p.nom]: e.target.value }))}
                  className="h-7 w-20 text-sm border border-gray-300 rounded px-2"
                />
              </div>
              {editingPrixFor === p.nom && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 shrink-0">{getProduitPrixLabel(p)}</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={prixValues[p.nom] ?? ''}
                      onChange={(e) => setPrixValues((prev) => ({ ...prev, [p.nom]: e.target.value }))}
                      placeholder="0"
                      className="h-7 w-28 text-sm border border-gray-300 rounded px-2"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 shrink-0">FAS (€)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={fasValues[p.nom] ?? ''}
                      onChange={(e) => setFasValues((prev) => ({ ...prev, [p.nom]: e.target.value }))}
                      placeholder="0"
                      className="h-7 w-24 text-sm border border-gray-300 rounded px-2"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          <Button size="sm" onClick={() => {
            const names = selectedProducts.map((p) => p.nom);
            const fasMap: Record<string, string> = {};
            const prixMap: Record<string, string> = {};
            const quantiteMap: Record<string, string> = {};
            selectedProducts.forEach((p) => {
              const quantite = getQuantityValue(quantityValues[p.nom]);
              quantiteMap[p.nom] = String(quantite);
              fasMap[p.nom] = String(
                shouldMultiplyFas(p)
                  ? (Number(fasValues[p.nom] ?? '0') || 0) * quantite
                  : (Number(fasValues[p.nom] ?? '0') || 0)
              );
              if (prixValues[p.nom]?.trim()) {
                prixMap[p.nom] = String((Number(prixValues[p.nom]) || 0) * quantite);
              }
            });
            const extraReponses: SpQuestionReponse[] = [];
            if (Object.keys(fasMap).length > 0) {
              extraReponses.push({ question_id: '__fas_placeholder__', valeur: JSON.stringify(fasMap) });
            }
            if (Object.keys(prixMap).length > 0) {
              extraReponses.push({ question_id: '__prix_placeholder__', valeur: JSON.stringify(prixMap) });
            }
            if (Object.keys(quantiteMap).length > 0) {
              extraReponses.push({ question_id: '__quantite_placeholder__', valeur: JSON.stringify(quantiteMap) });
            }
            onSubmit(names, extraReponses.length > 0 ? extraReponses : undefined);
          }}>
            Valider ({selected.size} sélectionné{selected.size > 1 ? 's' : ''})
          </Button>
        </div>
      )}
    </div>
  );
}

function MultipleChoiceInput({
  options,
  onSubmit,
}: {
  options: string[];
  onSubmit: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (opt: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              selected.has(opt)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <Button size="sm" onClick={() => onSubmit(Array.from(selected))}>
          Valider ({selected.size} sélectionné{selected.size > 1 ? 's' : ''})
        </Button>
      )}
    </div>
  );
}

function MultipleSelectInput({
  options,
  onSubmit,
}: {
  options: string[];
  onSubmit: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="space-y-2">
      <div className="max-h-56 overflow-y-auto rounded border border-gray-300 bg-white p-1 space-y-1">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setSelected((prev) => isSelected ? prev.filter((item) => item !== opt) : [...prev, opt])}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                isSelected ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-blue-50'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <Button size="sm" onClick={() => onSubmit(selected)}>
          Valider ({selected.length} sélectionné{selected.length > 1 ? 's' : ''})
        </Button>
      )}
    </div>
  );
}

interface ExpandedQuestion {
  question: SpQuestion;
  instanceId: string;
  displayLabel: string;
  iterationIndex: number;
  iterationLabel?: string;
}

interface QuestionnaireSnapshot {
  reponses: SpQuestionReponse[];
  messages: MessageBubble[];
  hiddenByConsequence: Set<string>;
  shownByConsequence: Set<string>;
  dynamicFilters: Map<string, SpFiltresCatalogue>;
  currentIdx: number;
}

function hasVisibilityConditions(question: SpQuestion): boolean {
  return (question.groupes_conditions?.length ?? 0) > 0;
}

export function SpQuestionnaireUI({
  questions,
  donneesExtraites,
  catalogue,
  fournisseurs,
  onComplete,
  initialReponses,
  isSimulation = false,
  siteLabel,
  startFromQuestionId,
}: SpQuestionnaireUIProps) {
  const [reponses, setReponses] = useState<SpQuestionReponse[]>(initialReponses ?? []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [messages, setMessages] = useState<MessageBubble[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [adresseEdit, setAdresseEdit] = useState<SpAdresse>({ adresse: '', code_postal: '', ville: '' });
  const [hiddenByConsequence, setHiddenByConsequence] = useState<Set<string>>(new Set());
  const [shownByConsequence, setShownByConsequence] = useState<Set<string>>(new Set());
  const [dynamicFilters, setDynamicFilters] = useState<Map<string, SpFiltresCatalogue>>(new Map());
  const [pendingCatalogueSelection, setPendingCatalogueSelection] = useState<{
    instanceId: string;
    product: CatalogueProduit;
    fasValue: string;
    prixValue: string;
    quantityValue: string;
    prixEditing: boolean;
  } | null>(null);
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [history, setHistory] = useState<QuestionnaireSnapshot[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  // Track pending show timer to cancel it on re-init (prevents StrictMode duplicate messages)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when questions change (e.g. switching sites in multisite)
  useEffect(() => {
    // Cancel any pending show animation to prevent ghost messages
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    hasInitialized.current = false;
    setReponses(initialReponses ?? []);
    setCurrentIdx(0);
    setMessages([]);
    setIsTyping(false);
    setInputValue('');
    setAdresseEdit({ adresse: '', code_postal: '', ville: '' });
    setHiddenByConsequence(new Set());
    setShownByConsequence(new Set());
    setDynamicFilters(new Map());
    setPendingCatalogueSelection(null);
    setHistory([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, []);

  // ── Expand questions: handle loop groups ──────────────────────────
  const expandedQuestions: ExpandedQuestion[] = (() => {
    const result: ExpandedQuestion[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (processed.has(q.id)) continue;

      if (q.boucle && q.groupe_boucle_id) {
        const groupId = q.groupe_boucle_id;
        const loopQuestions = questions.filter((lq) => lq.groupe_boucle_id === groupId);
        loopQuestions.forEach((lq) => processed.add(lq.id));

        let iterationCount = q.boucle.nombre_fixe ?? 1;
        const labels: string[] = [];
        const loopItemsFromSa = getLoopItemsFromSa(
          donneesExtraites,
          q.boucle.source_sa_array,
          q.boucle.source_sa_filtre_champ,
          q.boucle.source_sa_filtre_valeur,
        );

        if (q.boucle.source_nombre_question_id) {
          const rep = reponses.find((r) => r.question_id === q.boucle!.source_nombre_question_id);
          if (rep) {
            const n = Number(rep.valeur);
            if (Number.isFinite(n) && n > 0) iterationCount = n;
          }
        } else if (loopItemsFromSa.length > 0) {
          iterationCount = loopItemsFromSa.length;
        }

        if (q.boucle.source_labels_question_id) {
          const rep = reponses.find((r) => r.question_id === q.boucle!.source_labels_question_id);
          if (rep && Array.isArray(rep.valeur)) {
            labels.push(...rep.valeur.map(String));
          } else if (rep && typeof rep.valeur === 'string') {
            labels.push(...rep.valeur.split(',').map((s) => s.trim()).filter(Boolean));
          }
        } else if (q.boucle.source_sa_label_champ && loopItemsFromSa.length > 0) {
          labels.push(
            ...loopItemsFromSa.map((item, index) => {
              const value = item[q.boucle!.source_sa_label_champ!];
              return value != null && String(value).trim()
                ? String(value).trim()
                : `${q.boucle?.label_prefix || 'Item'} ${index + 1}`;
            }),
          );
        }

        for (let iter = 0; iter < iterationCount; iter++) {
          const iterLabel = labels[iter] || `${q.boucle.label_prefix || 'Item'} ${iter + 1}`;
          for (const lq of loopQuestions) {
            result.push({
              question: lq,
              instanceId: `${lq.id}__iter_${iter}`,
              displayLabel: resolveSaTemplateText(`[${iterLabel}] ${lq.libelle}`, donneesExtraites),
              iterationIndex: iter,
              iterationLabel: iterLabel,
            });
          }
        }
      } else if (!q.groupe_boucle_id) {
        result.push({
          question: q,
          instanceId: q.id,
          displayLabel: resolveSaTemplateText(q.libelle, donneesExtraites),
          iterationIndex: -1,
        });
      }
    }
    return result;
  })();

  // ── Visibility check — accepts explicit reponses + explicit sets to avoid stale closure ──
  const isQuestionVisibleWith = useCallback((
    eq: ExpandedQuestion,
    reps: SpQuestionReponse[],
    hidden = hiddenByConsequence,
    shown = shownByConsequence,
  ): boolean => {
    const effectiveReponses = eq.iterationIndex >= 0
      ? remapReponsesForIteration(reps, questions, eq.question.groupe_boucle_id!, eq.iterationIndex)
      : reps;

    const visibleByConditions = evaluateQuestionVisibility(
      eq.question,
      effectiveReponses,
      donneesExtraites,
      catalogue,
    );

    // Questions with explicit visibility conditions must remain driven by those
    // conditions. Unconditional show/hide consequences are only applied to
    // questions that do not define their own `groupes_conditions`.
    if (hasVisibilityConditions(eq.question)) {
      return visibleByConditions;
    }

    if (hidden.has(eq.question.id) || hidden.has(eq.instanceId)) return false;
    if (shown.has(eq.question.id) || shown.has(eq.instanceId)) return true;

    return visibleByConditions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenByConsequence, shownByConsequence, questions, donneesExtraites, catalogue]);

  const isQuestionVisible = (eq: ExpandedQuestion): boolean => isQuestionVisibleWith(eq, reponses);

  const findNextVisibleIndex = (
    fromIdx: number,
    reps: SpQuestionReponse[],
    hidden = hiddenByConsequence,
    shown = shownByConsequence,
  ): number => {
    for (let i = fromIdx + 1; i < expandedQuestions.length; i++) {
      if (isQuestionVisibleWith(expandedQuestions[i], reps, hidden, shown)) return i;
    }
    return expandedQuestions.length;
  };

  useEffect(() => {
    if (questions.length > 0 && expandedQuestions.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      const initReponses = initialReponses ?? [];
      let startIdx = -1;
      if (startFromQuestionId) {
        startIdx = expandedQuestions.findIndex((eq) => eq.question.id === startFromQuestionId);
      }
      if (startIdx < 0) {
        startIdx = expandedQuestions.findIndex((eq) =>
          isQuestionVisibleWith(eq, initReponses, new Set(), new Set())
        );
      }
      if (startIdx >= 0) {
        showQuestion(startIdx);
      } else {
        setCurrentIdx(expandedQuestions.length);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, expandedQuestions.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-advance when the displayed question becomes invisible (consequence or condition-based).
  // currentIdx is included so the effect also fires after the 500ms typing timer updates the
  // index — without it, a condition-based invisible last question is never skipped over.
  useEffect(() => {
    const eq = expandedQuestions[currentIdx];
    if (eq && !isTyping && !isQuestionVisibleWith(eq, reponses)) {
      const nextIdx = findNextVisibleIndex(currentIdx, reponses);
      if (nextIdx < expandedQuestions.length) {
        showQuestion(nextIdx);
      } else {
        setCurrentIdx(expandedQuestions.length);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenByConsequence, shownByConsequence, currentIdx]);

  const showQuestion = (idx: number) => {
    if (idx >= expandedQuestions.length) return;
    const eq = expandedQuestions[idx];

    // Cancel any previous pending animation to avoid stale/duplicate messages
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    setIsTyping(true);
    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = null;
      setIsTyping(false);
      setCurrentIdx(idx);
      setMessages((prev) => [...prev, { from: 'bot', text: eq.displayLabel }]);
    }, 500);
  };

  // ── Process consequences — returns updated sets synchronously ────────────────
  const processConsequences = (
    consequences: SpConsequence[],
    answeredValue: SpQuestionReponse['valeur'],
    currentHidden: Set<string>,
    currentShown: Set<string>,
  ): { jumpTo: string | null; newHidden: Set<string>; newShown: Set<string> } => {
    let jumpToQuestionId: string | null = null;
    // Clone sets so we can apply changes synchronously for immediate use
    const newHidden = new Set(currentHidden);
    const newShown = new Set(currentShown);

    const matchesDeclencheur = (c: SpConsequence): boolean => {
      if (!c.valeur_declencheur) return true;
      return formatReponseText(answeredValue).toLowerCase() === c.valeur_declencheur.trim().toLowerCase();
    };

    for (const c of consequences) {
      if (!matchesDeclencheur(c)) continue;
      switch (c.type) {
        case 'afficher_question':
          if (c.question_id) {
            newShown.add(c.question_id);
            newHidden.delete(c.question_id);
          }
          break;
        case 'masquer_question':
          if (c.question_id) {
            newHidden.add(c.question_id);
            newShown.delete(c.question_id);
          }
          break;
        case 'aller_question':
          if (c.question_id) jumpToQuestionId = c.question_id;
          break;
        case 'filtrer_question':
          if (c.question_id && c.filtre) {
            setDynamicFilters((prev) => new Map(prev).set(c.question_id!, c.filtre!));
          }
          break;
        case 'afficher_message':
          if (c.message_texte?.trim()) {
            setMessages((prev) => [...prev, { from: 'bot', text: c.message_texte! }]);
          }
          break;
        case 'renseigner_variable':
          break;
      }
    }

    // Apply to React state (for future renders)
    setHiddenByConsequence(newHidden);
    setShownByConsequence(newShown);

    return { jumpTo: jumpToQuestionId, newHidden, newShown };
  };

  const goBack = () => {
    if (history.length === 0) return;
    const snapshot = history[history.length - 1];
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    setHistory((prev) => prev.slice(0, -1));
    setReponses(snapshot.reponses);
    setMessages(snapshot.messages);
    setHiddenByConsequence(snapshot.hiddenByConsequence);
    setShownByConsequence(snapshot.shownByConsequence);
    setDynamicFilters(snapshot.dynamicFilters);
    setCurrentIdx(snapshot.currentIdx);
    setIsTyping(false);
    setInputValue('');
    setAdresseEdit({ adresse: '', code_postal: '', ville: '' });
    setPendingCatalogueSelection(null);
  };

  const recordAnswer = (instanceId: string, valeur: SpQuestionReponse['valeur'], extraReponses?: SpQuestionReponse[]) => {
    // Save snapshot before changing state so "back" can restore this exact moment
    setHistory((prev) => [...prev, {
      reponses: [...reponses],
      messages: [...messages],
      hiddenByConsequence: new Set(hiddenByConsequence),
      shownByConsequence: new Set(shownByConsequence),
      dynamicFilters: new Map(dynamicFilters),
      currentIdx,
    }]);

    const rep: SpQuestionReponse = { question_id: instanceId, valeur };
    const extra = extraReponses ?? [];
    const auxiliaryQuestionIds = [`fas_${instanceId}`, `prix_${instanceId}`, `quantite_${instanceId}`];
    // Build updated reponses synchronously
    const nextReps = [
      ...reponses.filter((r) =>
        r.question_id !== instanceId &&
        !auxiliaryQuestionIds.includes(r.question_id) &&
        !extra.some((er) => er.question_id === r.question_id)
      ),
      rep,
      ...extra,
    ];
    setReponses(nextReps);
    setMessages((prev) => [...prev, { from: 'user', text: formatReponseText(valeur) }]);

    const eq = expandedQuestions[currentIdx];

    // Process consequences synchronously so findNextVisibleIndex sees updated sets
    const { jumpTo, newHidden, newShown } = processConsequences(
      eq?.question.consequences ?? [],
      valeur,
      hiddenByConsequence,
      shownByConsequence,
    );

    if (jumpTo) {
      const jumpIdx = expandedQuestions.findIndex(
        (e) => e.question.id === jumpTo || e.instanceId === jumpTo,
      );
      if (jumpIdx >= 0) { showQuestion(jumpIdx); return; }
    }

    // Use freshly computed sets so consequence-hidden questions are correctly skipped
    const nextIdx = findNextVisibleIndex(currentIdx, nextReps, newHidden, newShown);
    if (nextIdx < expandedQuestions.length) {
      showQuestion(nextIdx);
    } else {
      setCurrentIdx(expandedQuestions.length);
    }
  };

  const currentExpanded = currentIdx < expandedQuestions.length ? expandedQuestions[currentIdx] : null;
  const currentQuestionVisible = currentExpanded !== null && isQuestionVisible(currentExpanded);
  const currentQuestion = currentQuestionVisible ? currentExpanded.question : null;

  const currentCatalogueOptions: CatalogueProduit[] = (() => {
    if (!currentQuestion || (currentQuestion.source !== 'catalogue' && currentQuestion.source !== 'catalogue_et_sa')) return [];
    let filtered = catalogue.filter((p) => p.actif);
    if (currentQuestion.filtres_catalogue) filtered = filterCatalogueByFiltre(filtered, currentQuestion.filtres_catalogue);
    const dynFilter = currentExpanded ? dynamicFilters.get(currentQuestion.id) ?? dynamicFilters.get(currentExpanded.instanceId) : undefined;
    if (dynFilter) filtered = filterCatalogueByFiltre(filtered, dynFilter);
    if (currentQuestion.nombre_max_resultats) filtered = filtered.slice(0, currentQuestion.nombre_max_resultats);
    return filtered;
  })();

  const isCatalogueQuestion = currentQuestion?.source === 'catalogue' || currentQuestion?.source === 'catalogue_et_sa';
  const normalizedCatalogueSearch = catalogueSearch.trim().toLowerCase();
  const filteredCatalogueOptions = normalizedCatalogueSearch
    ? currentCatalogueOptions.filter((p) => [
      p.nom,
      p.fournisseur,
      p.categorie,
      p.description,
      ...(p.tags ?? []),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedCatalogueSearch)))
    : currentCatalogueOptions;

  const allObligatoryAnswered = expandedQuestions
    .filter((eq) => eq.question.obligatoire && isQuestionVisible(eq))
    .every((eq) => reponses.some((r) => r.question_id === eq.instanceId));

  const isDone = allObligatoryAnswered && !currentQuestion && !isTyping;

  return (
    <div className="space-y-4">
      {siteLabel && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
          <span className="text-sm font-medium text-purple-800">{siteLabel}</span>
        </div>
      )}

      {/* Chat history */}
      <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 min-h-48 max-h-80 overflow-y-auto space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.from === 'bot' && (
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-blue-600" />
              </div>
            )}
            <div className={`max-w-xs md:max-w-sm px-3 py-2 rounded-lg text-sm leading-relaxed ${
              msg.from === 'bot'
                ? 'bg-white border border-gray-200 text-gray-800'
                : 'bg-blue-600 text-white'
            }`}>
              {msg.text}
            </div>
            {msg.from === 'user' && (
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-green-600" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Back button */}
      {history.length > 0 && !isTyping && (
        <div className="flex">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-0.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Revenir à la question précédente
          </button>
        </div>
      )}

      {/* Current question input */}
      {currentQuestion && currentExpanded && !isTyping && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">{currentExpanded.displayLabel}</p>
          {currentQuestion.description && (
            <p className="text-xs text-blue-600">{resolveSaTemplateText(currentQuestion.description, donneesExtraites)}</p>
          )}
          {currentExpanded.iterationLabel && (
            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              {currentExpanded.iterationLabel}
            </span>
          )}

          {currentQuestion.affichage === 'oui_non' && (
            <div className="flex gap-2">
              {['Oui', 'Non'].map((opt) => (
                <Button key={opt} size="sm" variant="outline" className="bg-white"
                  onClick={() => recordAnswer(currentExpanded.instanceId, opt === 'Oui')}>
                  {opt}
                </Button>
              ))}
            </div>
          )}

          {(currentQuestion.affichage === 'boutons_choix_unique' || currentQuestion.affichage === 'choix_liste_manuelle') && (
            <div className="space-y-2">
              {currentCatalogueOptions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {currentCatalogueOptions.map((p) => {
                    const prix = formatPrixProduit(p);
                    const fas = p.prix_installation != null ? `FAS: ${p.prix_installation.toFixed(2).replace('.', ',')} €` : null;
                    const isPending = pendingCatalogueSelection?.product.nom === p.nom
                      && pendingCatalogueSelection?.instanceId === currentExpanded.instanceId;
                    return (
                      <button key={p.nom} type="button"
                        onClick={() => setPendingCatalogueSelection({
                          instanceId: currentExpanded.instanceId,
                          product: p,
                          fasValue: p.prix_installation != null ? p.prix_installation.toString() : '0',
                          prixValue: getProduitPrixValue(p),
                          quantityValue: '1',
                          prixEditing: false,
                        })}
                        className={`text-left px-3 py-2 rounded-md border transition-colors ${
                          isPending ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        <div className="text-sm font-medium">{p.nom}</div>
                        {(prix || fas) && (
                          <div className={`text-xs mt-0.5 ${isPending ? 'text-blue-100' : 'text-gray-400'}`}>
                            {[prix, fas].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(currentQuestion.options_manuelles?.length
                    ? currentQuestion.options_manuelles
                    : isCatalogueQuestion ? [] : fournisseurs
                  ).map((opt) => (
                    <Button key={opt} size="sm" variant="outline" className="bg-white"
                      onClick={() => recordAnswer(currentExpanded.instanceId, opt)}>
                      {opt}
                    </Button>
                  ))}
                </div>
              )}
              {currentQuestion.options_libres && (
                <div className="flex gap-2 w-full mt-1">
                  <input
                    value={inputValue}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                    placeholder="Autre..."
                    className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter' && inputValue.trim()) {
                        recordAnswer(currentExpanded.instanceId, inputValue.trim());
                        setInputValue('');
                      }
                    }}
                  />
                  <Button size="sm" onClick={() => {
                    if (inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); }
                  }}>Valider</Button>
                </div>
              )}
            </div>
          )}

          {currentQuestion.affichage === 'liste_deroulante' && (
            <div className="space-y-2">
              {currentCatalogueOptions.length > 0 && (
                <input
                  type="search"
                  value={catalogueSearch}
                  onChange={(e) => setCatalogueSearch(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="h-8 w-full text-sm border border-gray-300 rounded px-2 bg-white"
                />
              )}
              <select
                value={pendingCatalogueSelection?.instanceId === currentExpanded.instanceId && currentCatalogueOptions.length > 0
                  ? pendingCatalogueSelection.product.nom : ''}
                onChange={(e) => {
                  if (!e.target.value) return;
                  if (currentCatalogueOptions.length > 0) {
                    const p = currentCatalogueOptions.find((prod) => prod.nom === e.target.value);
                    if (p) setPendingCatalogueSelection({
                      instanceId: currentExpanded.instanceId,
                      product: p,
                      fasValue: p.prix_installation != null ? p.prix_installation.toString() : '0',
                      prixValue: getProduitPrixValue(p),
                      quantityValue: '1',
                      prixEditing: false,
                    });
                  } else {
                    recordAnswer(currentExpanded.instanceId, e.target.value);
                  }
                }}
                className="h-8 text-sm border border-gray-300 rounded px-2 flex-1 bg-white">
                <option value="">Sélectionnez...</option>
                {currentCatalogueOptions.length > 0
                  ? filteredCatalogueOptions.map((p) => {
                    const prix = formatPrixProduit(p);
                    const fas = p.prix_installation != null ? `FAS: ${p.prix_installation.toFixed(2).replace('.', ',')} €` : null;
                    return <option key={p.nom} value={p.nom}>{[p.nom, prix, fas].filter(Boolean).join(' · ')}</option>;
                  })
                  : (currentQuestion.options_manuelles ?? (isCatalogueQuestion ? [] : fournisseurs)).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
              </select>
            </div>
          )}

          {currentQuestion.affichage === 'boutons_choix_multiple' && (
            currentCatalogueOptions.length > 0 ? (
              <CatalogueMultipleChoiceInput
                products={currentCatalogueOptions}
                onSubmit={(selectedNames, extraReponses) => {
                  const nextExtras = (extraReponses ?? []).map((r) => {
                    if (r.question_id === '__fas_placeholder__') {
                      return { ...r, question_id: 'fas_' + currentExpanded.instanceId };
                    }
                    if (r.question_id === '__prix_placeholder__') {
                      return { ...r, question_id: 'prix_' + currentExpanded.instanceId };
                    }
                    if (r.question_id === '__quantite_placeholder__') {
                      return { ...r, question_id: 'quantite_' + currentExpanded.instanceId };
                    }
                    return r;
                  });
                  recordAnswer(currentExpanded.instanceId, selectedNames, nextExtras);
                }}
              />
            ) : (
              <MultipleChoiceInput
                options={currentQuestion.options_manuelles ?? (isCatalogueQuestion ? [] : fournisseurs)}
                onSubmit={(selected) => recordAnswer(currentExpanded.instanceId, selected)}
              />
            )
          )}

          {currentQuestion.affichage === 'liste_deroulante_choix_multiple' && (
            currentCatalogueOptions.length > 0 ? (
              <CatalogueMultipleChoiceInput
                products={currentCatalogueOptions}
                display="select"
                onSubmit={(selectedNames, extraReponses) => {
                  const nextExtras = (extraReponses ?? []).map((r) => {
                    if (r.question_id === '__fas_placeholder__') {
                      return { ...r, question_id: 'fas_' + currentExpanded.instanceId };
                    }
                    if (r.question_id === '__prix_placeholder__') {
                      return { ...r, question_id: 'prix_' + currentExpanded.instanceId };
                    }
                    if (r.question_id === '__quantite_placeholder__') {
                      return { ...r, question_id: 'quantite_' + currentExpanded.instanceId };
                    }
                    return r;
                  });
                  recordAnswer(currentExpanded.instanceId, selectedNames, nextExtras);
                }}
              />
            ) : (
              <MultipleSelectInput
                options={currentQuestion.options_manuelles ?? (isCatalogueQuestion ? [] : fournisseurs)}
                onSubmit={(selected) => recordAnswer(currentExpanded.instanceId, selected)}
              />
            )
          )}

          {currentQuestion.affichage === 'date' && (
            <div className="flex gap-2">
              <input value={inputValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                type="date" className="h-8 text-sm border border-gray-300 rounded px-2" />
              <Button size="sm" onClick={() => { if (inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); } }}>
                Valider
              </Button>
            </div>
          )}

          {(currentQuestion.affichage === 'texte_court' || currentQuestion.affichage === 'nombre') && (
            <div className="flex gap-2">
              <input value={inputValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                placeholder="Votre réponse..." type={currentQuestion.affichage === 'nombre' ? 'number' : 'text'}
                className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); }
                }} />
              <Button size="sm" onClick={() => { if (inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); } }}>
                Valider
              </Button>
            </div>
          )}

          {currentQuestion.affichage === 'texte_long' && (
            <div className="space-y-2">
              <textarea value={inputValue} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
                placeholder="Votre réponse..." rows={3} className="text-sm border border-gray-300 rounded px-2 py-1 w-full" />
              <Button size="sm" onClick={() => { if (inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); } }}>
                Valider
              </Button>
            </div>
          )}

          {(currentQuestion.affichage === 'adresse_complete' || currentQuestion.affichage === 'edition_sa') && (
            <div className="space-y-2">
              <input placeholder="Adresse (rue, numéro)" value={adresseEdit.adresse}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, adresse: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full" />
              <div className="flex gap-2">
                <input placeholder="Code postal" value={adresseEdit.code_postal}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, code_postal: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 w-32" />
                <input placeholder="Ville" value={adresseEdit.ville}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, ville: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 flex-1" />
              </div>
              <Button size="sm" disabled={!adresseEdit.adresse || !adresseEdit.code_postal || !adresseEdit.ville}
                onClick={() => { recordAnswer(currentExpanded.instanceId, { ...adresseEdit }); setAdresseEdit({ adresse: '', code_postal: '', ville: '' }); }}>
                Valider
              </Button>
            </div>
          )}

          {currentQuestion.affichage === 'confirmation_sa' && (
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => recordAnswer(currentExpanded.instanceId, true)}>
                Oui, c&apos;est correct
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => recordAnswer(currentExpanded.instanceId, false)}>
                Non, modifier
              </Button>
            </div>
          )}

          {/* Zone de confirmation pour sélection catalogue (unique + liste_deroulante) */}
          {pendingCatalogueSelection?.instanceId === currentExpanded.instanceId && (
            <div className="mt-1 p-3 bg-white border border-blue-300 rounded-lg space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-800">{pendingCatalogueSelection.product.nom}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Qté {getQuantityValue(pendingCatalogueSelection.quantityValue)}
                </span>
                {formatProduitPrixValue(pendingCatalogueSelection.prixValue, pendingCatalogueSelection.product) && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Unitaire: {formatProduitPrixValue(pendingCatalogueSelection.prixValue, pendingCatalogueSelection.product)}
                  </span>
                )}
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Total: {formatProduitTotalValue(
                    pendingCatalogueSelection.prixValue,
                    pendingCatalogueSelection.product,
                    pendingCatalogueSelection.quantityValue,
                  ) ?? '0,00 €'}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {shouldMultiplyFas(pendingCatalogueSelection.product)
                    ? formatProduitFasTotalValue(pendingCatalogueSelection.fasValue, pendingCatalogueSelection.quantityValue)
                    : formatProduitFasValue(pendingCatalogueSelection.fasValue)}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingCatalogueSelection((prev) => prev ? { ...prev, prixEditing: !prev.prixEditing } : null)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                  aria-label="Modifier le prix et le FAS"
                  title="Modifier le prix et le FAS"
                >
                  {pendingCatalogueSelection.prixEditing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 shrink-0">Quantité :</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={pendingCatalogueSelection.quantityValue}
                  onChange={(e) => setPendingCatalogueSelection((prev) => prev ? { ...prev, quantityValue: e.target.value } : null)}
                  className="h-7 w-20 text-sm border border-gray-300 rounded px-2"
                />
              </div>
              {pendingCatalogueSelection.prixEditing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 shrink-0">{getProduitPrixLabel(pendingCatalogueSelection.product)} :</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={pendingCatalogueSelection.prixValue}
                      onChange={(e) => setPendingCatalogueSelection((prev) => prev ? { ...prev, prixValue: e.target.value } : null)}
                      placeholder="0"
                      className="h-7 w-28 text-sm border border-gray-300 rounded px-2"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 shrink-0">FAS (€) :</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={pendingCatalogueSelection.fasValue}
                      onChange={(e) => setPendingCatalogueSelection((prev) => prev ? { ...prev, fasValue: e.target.value } : null)}
                      placeholder="0"
                      className="h-7 w-28 text-sm border border-gray-300 rounded px-2"
                    />
                  </div>
                </div>
              )}
              <Button size="sm" onClick={() => {
                const fasVal = pendingCatalogueSelection.fasValue.trim();
                const prixVal = pendingCatalogueSelection.prixValue.trim();
                const quantiteVal = String(getQuantityValue(pendingCatalogueSelection.quantityValue));
                const quantite = getQuantityValue(pendingCatalogueSelection.quantityValue);
                const extras: SpQuestionReponse[] = [];
                if (fasVal) extras.push({
                  question_id: 'fas_' + pendingCatalogueSelection.instanceId,
                  valeur: String(
                    shouldMultiplyFas(pendingCatalogueSelection.product)
                      ? (Number(fasVal) || 0) * quantite
                      : (Number(fasVal) || 0)
                  ),
                });
                if (prixVal) extras.push({
                  question_id: 'prix_' + pendingCatalogueSelection.instanceId,
                  valeur: String((Number(prixVal) || 0) * quantite),
                });
                extras.push({
                  question_id: 'quantite_' + pendingCatalogueSelection.instanceId,
                  valeur: quantiteVal,
                });
                recordAnswer(pendingCatalogueSelection.instanceId, pendingCatalogueSelection.product.nom, extras.length > 0 ? extras : undefined);
                setPendingCatalogueSelection(null);
              }}>
                Valider
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Completion zone */}
      {isDone && (
        <div className="border border-green-200 rounded-lg bg-green-50 p-4 space-y-3">
          <p className="font-medium text-green-900">
            ✓ Toutes les questions obligatoires ont été répondues.
          </p>
          {isSimulation ? (
            <div className="space-y-2">
              <p className="text-sm text-green-700">Résumé de la simulation :</p>
              <ul className="text-sm text-gray-700 space-y-1 max-h-40 overflow-y-auto">
                {reponses.map((r) => {
                  const q = expandedQuestions.find((eq) => eq.instanceId === r.question_id);
                  return (
                    <li key={r.question_id} className="flex gap-2">
                      <span className="text-gray-500 shrink-0">{q?.displayLabel ?? r.question_id} :</span>
                      <span className="font-medium">{formatReponseText(r.valeur)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <Button onClick={() => onComplete(reponses)} className="bg-green-600 hover:bg-green-700">
              <ChevronRight className="w-4 h-4 mr-2" />
              Générer la Situation Proposée
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
