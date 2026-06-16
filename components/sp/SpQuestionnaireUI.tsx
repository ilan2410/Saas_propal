'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bot, User, ChevronLeft, ChevronRight, Pencil, Check, Loader2, GripHorizontal, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportSaSpButtons } from '@/components/propositions/ExportSaSpButtons';
import { SpRealTimeCart } from '@/components/sp/SpRealTimeCart';
import { SaRealTimeCart } from '@/components/sp/SaRealTimeCart';
import { SpMargeWidget } from '@/components/sp/SpMargeWidget';
import { SpIndemniteWidget } from '@/components/sp/SpIndemniteWidget';
import type { SpQuestion, SpQuestionReponse, SpAdresse, CatalogueProduit, CatalogueCategorie, SpFiltresCatalogue, SpConsequence, SpRegleRemise, SpCodePromo, SpConfigLoyer, SpConfigResiliation, SpProduitLibre, SpConfigMoisOfferts, SpObjectifConfig, SpConfigResumeRef, SpConfigModeClient } from '@/types';
import { evaluateQuestionVisibility, filterCatalogueByFiltre } from '@/lib/sp/evaluateConditions';
import { getEligibleDiscountProducts } from '@/lib/sp/evaluateDiscountRules';
import { resolvePrixPourQuantite } from '@/lib/catalogue/resolvePrix';
import { findApplicableBareme } from '@/lib/sp/evaluateBareme';
import { calculerLoyer, DEFAULT_CONFIG_LOYER } from '@/lib/sp/calculLoyer';
import { calculateCartSummary } from '@/lib/sp/calculateCart';
import { estimateResiliationFromSA } from '@/lib/sp/resiliation';
import { evaluateObjectifsForRender } from '@/lib/sp/evaluateObjectifs';
import SpObjectifsAccomplis from '@/components/sp/SpObjectifsAccomplis';

export interface SpQuestionnaireUIProps {
  questions: SpQuestion[];
  donneesExtraites: Record<string, unknown>;
  catalogue: CatalogueProduit[];
  discountRules?: SpRegleRemise[];
  fournisseurs: string[];
  onComplete: (reponses: SpQuestionReponse[]) => void;
  initialReponses?: SpQuestionReponse[];
  isSimulation?: boolean;
  simulationPropositionId?: string;
  simulationExportStatus?: 'idle' | 'preparing' | 'ready' | 'error';
  simulationExportError?: string;
  siteLabel?: string;
  startFromQuestionId?: string;
  spConfigLoyer?: SpConfigLoyer;
  spConfigResiliation?: SpConfigResiliation;
  spConfigMoisOfferts?: SpConfigMoisOfferts;
  spCodesPromo?: SpCodePromo[];
  spCodesPromoMode?: 'addition' | 'soustraction';
  spCodesPromoMasquerSaisie?: boolean;
  objectifsConfig?: SpObjectifConfig[];
  templateId?: string;
  spConfigResumeRef?: SpConfigResumeRef;
  spConfigModeClient?: SpConfigModeClient;
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

function countTemplateValue(value: unknown): string {
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return value.trim() ? '1' : '0';
  if (value == null) return '0';
  return '1';
}

function getSpTemplateValue(
  reponses: SpQuestionReponse[],
  questionId: string,
  iterationIndex = -1,
): SpQuestionReponse['valeur'] | undefined {
  const cleanId = questionId.trim();
  const candidateIds = iterationIndex >= 0
    ? [`${cleanId}__iter_${iterationIndex}`, cleanId]
    : [cleanId];

  return reponses.find((reponse) => candidateIds.includes(reponse.question_id))?.valeur;
}

function resolveTemplateText(
  text: string,
  donneesExtraites: Record<string, unknown>,
  reponses: SpQuestionReponse[],
  iterationIndex = -1,
): string {
  return text.replace(/\{\{(sa|count|sp|sp_count):([^}|]+)(?:\|([^}]+))?\}\}/g, (_match, type, path, rawOptions) => {
    const cleanPath = String(path).trim();
    if (type === 'sa') return formatSaTemplateValue(getNestedValue(donneesExtraites, cleanPath));
    if (type === 'sp') return formatReponseText(getSpTemplateValue(reponses, cleanPath, iterationIndex) ?? 'Non renseigné');
    if (type === 'sp_count') return countTemplateValue(getSpTemplateValue(reponses, cleanPath, iterationIndex));

    const optionText = typeof rawOptions === 'string' ? rawOptions.trim() : '';
    const filterMatch = optionText.match(/^([^=]+)=(.+)$/);
    const filterField = filterMatch?.[1]?.trim();
    const filterValue = filterMatch?.[2]?.trim();

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
  if (typeof valeur === 'string') {
    if (valeur === FREE_ENTRY_MARKER) return FREE_ENTRY_LABEL;
    return valeur;
  }
  if (Array.isArray(valeur)) {
    const parts = valeur.map((v) => (v === FREE_ENTRY_MARKER ? FREE_ENTRY_LABEL : v));
    return parts.join(', ');
  }
  if (typeof valeur === 'object' && valeur !== null) {
    const a = valeur as SpAdresse;
    return [a.adresse, a.complement, `${a.code_postal} ${a.ville}`].filter(Boolean).join(', ');
  }
  return String(valeur);
}

function formatResiliationMoney(value: number | null | undefined): string {
  if (value == null) return 'Non trouvé';
  return `${value.toFixed(2)} EUR`;
}

function hasGroupedResiliationCalculation(estimation: {
  groupes_calcul: Array<{ sous_total: number | null }>;
}): boolean {
  return estimation.groupes_calcul.some((group) => group.sous_total !== null);
}

function formatResiliationRemainingMonths(
  moisRestants: number | null | undefined,
  moisAvantPreavis: number | null | undefined,
  preavisMois: number,
): string | null {
  if (moisRestants == null) return null;
  if (moisAvantPreavis != null) {
    return `${moisRestants} mois restants (${moisAvantPreavis} - ${preavisMois} de preavis)`;
  }
  return `${moisRestants} mois restants`;
}

function getResiliationFiabiliteClasses(fiabilite: string): string {
  switch (fiabilite) {
    case 'forte':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'moyenne':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'faible':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
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

// ── Saisie libre (option "Autre valeur") ──────────────────────────────────────
const FREE_ENTRY_MARKER = '__libre__';
const FREE_ENTRY_LABEL = 'Autre valeur';
const FREE_ENTRY_CATEGORIES: { value: CatalogueCategorie; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'internet', label: 'Internet' },
  { value: 'fixe', label: 'Fixe' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'equipement', label: 'Équipement' },
  { value: 'cadeau', label: 'Cadeau' },
  { value: 'installation', label: 'Installation' },
];

interface FreeEntryDraft {
  label: string;
  prix: string;
  categorie: CatalogueCategorie;
}

function FreeEntryForm({
  draft,
  onChange,
  hidePrix = false,
}: {
  draft: FreeEntryDraft;
  onChange: (next: FreeEntryDraft) => void;
  hidePrix?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 shrink-0 w-24">Libellé :</label>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder="Ex: Forfait sur-mesure"
          className="h-7 flex-1 text-sm border border-gray-300 rounded px-2"
        />
      </div>
      {!hidePrix && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 shrink-0 w-24">Prix (€) :</label>
          <input
            type="number" min="0" step="0.01"
            value={draft.prix}
            onChange={(e) => onChange({ ...draft, prix: e.target.value })}
            placeholder="0"
            className="h-7 w-28 text-sm border border-gray-300 rounded px-2"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 shrink-0 w-24">Catégorie :</label>
        <select
          value={draft.categorie}
          onChange={(e) => onChange({ ...draft, categorie: e.target.value as CatalogueCategorie })}
          className="h-7 text-sm border border-gray-300 rounded px-2 bg-white"
        >
          {FREE_ENTRY_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function isValidFreeEntry(draft: FreeEntryDraft | null): draft is FreeEntryDraft {
  if (!draft) return false;
  if (!draft.label.trim()) return false;
  const prix = Number(draft.prix);
  return Number.isFinite(prix) && prix >= 0;
}

function buildFreeEntryReponses(
  instanceId: string,
  draft: FreeEntryDraft,
): SpQuestionReponse[] {
  const produit: SpProduitLibre = {
    label: draft.label.trim(),
    prix: Number(draft.prix) || 0,
    categorie: draft.categorie,
  };
  return [{ question_id: 'libre_' + instanceId, valeur: JSON.stringify(produit) }];
}

function CatalogueMultipleChoiceInput({
  products,
  onSubmit,
  display = 'buttons',
  allowFreeEntry = false,
  hidePrice = false,
  hidePrixEditing = false,
}: {
  products: CatalogueProduit[];
  onSubmit: (selectedNames: string[], extraReponses?: SpQuestionReponse[]) => void;
  display?: 'buttons' | 'select';
  allowFreeEntry?: boolean;
  hidePrice?: boolean;
  hidePrixEditing?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freeEntryEnabled, setFreeEntryEnabled] = useState(false);
  const [freeEntryDraft, setFreeEntryDraft] = useState<FreeEntryDraft>({
    label: '',
    prix: '',
    categorie: 'equipement',
  });
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
                  {!hidePrice && (prix || fas) && (
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
                {!hidePrice && (prix || fas) && (
                  <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                    {[prix, fas].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {allowFreeEntry && (
        <label className="flex items-center gap-2 text-sm font-medium text-blue-800 cursor-pointer px-1">
          <input
            type="checkbox"
            checked={freeEntryEnabled}
            onChange={(e) => setFreeEntryEnabled(e.target.checked)}
          />
          {FREE_ENTRY_LABEL} (saisie libre)
        </label>
      )}

      {(selectedProducts.length > 0 || (allowFreeEntry && freeEntryEnabled)) && (
        <div className="space-y-2 p-3 bg-white border border-gray-200 rounded-lg">
          {selectedProducts.map((p) => (
            <div key={p.nom} className="space-y-2 rounded-md border border-gray-100 px-2 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{p.nom}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Qté {getQuantityValue(quantityValues[p.nom])}
                </span>
                {!hidePrice && formatProduitPrixValue(prixValues[p.nom] ?? '', p) && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Unitaire: {formatProduitPrixValue(prixValues[p.nom] ?? '', p)}
                  </span>
                )}
                {!hidePrice && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Total: {formatProduitTotalValue(prixValues[p.nom] ?? '', p, quantityValues[p.nom]) ?? '0,00 €'}
                  </span>
                )}
                {!hidePrice && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {shouldMultiplyFas(p)
                      ? formatProduitFasTotalValue(fasValues[p.nom] ?? '0', quantityValues[p.nom])
                      : formatProduitFasValue(fasValues[p.nom] ?? '0')}
                  </span>
                )}
                {!hidePrixEditing && (
                  <button
                    type="button"
                    onClick={() => setEditingPrixFor((current) => current === p.nom ? null : p.nom)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                    aria-label={`Modifier le prix et le FAS de ${p.nom}`}
                    title={`Modifier le prix et le FAS de ${p.nom}`}
                  >
                    {editingPrixFor === p.nom ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                  </button>
                )}
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
              {editingPrixFor === p.nom && !hidePrixEditing && (
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
          {allowFreeEntry && freeEntryEnabled && (
            <div className="rounded-md border border-blue-200 bg-blue-50/40 px-3 py-2">
              <p className="text-xs font-medium text-blue-800 mb-1">{FREE_ENTRY_LABEL}</p>
              <FreeEntryForm draft={freeEntryDraft} onChange={setFreeEntryDraft} hidePrix={hidePrice} />
            </div>
          )}
          <Button
            size="sm"
            disabled={selectedProducts.length === 0 && !(allowFreeEntry && freeEntryEnabled && isValidFreeEntry(freeEntryDraft))}
            onClick={() => {
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
            if (allowFreeEntry && freeEntryEnabled && isValidFreeEntry(freeEntryDraft)) {
              names.push(FREE_ENTRY_MARKER);
              extraReponses.push({ question_id: '__libre_placeholder__', valeur: JSON.stringify({
                label: freeEntryDraft.label.trim(),
                prix: Number(freeEntryDraft.prix) || 0,
                categorie: freeEntryDraft.categorie,
              } satisfies SpProduitLibre) });
            }
            onSubmit(names, extraReponses.length > 0 ? extraReponses : undefined);
          }}>
            Valider ({selected.size + (allowFreeEntry && freeEntryEnabled && isValidFreeEntry(freeEntryDraft) ? 1 : 0)} sélectionné{(selected.size + (allowFreeEntry && freeEntryEnabled && isValidFreeEntry(freeEntryDraft) ? 1 : 0)) > 1 ? 's' : ''})
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
  discountRules = [],
  fournisseurs,
  onComplete,
  initialReponses,
  isSimulation = false,
  simulationPropositionId,
  simulationExportStatus = 'idle',
  simulationExportError,
  siteLabel,
  startFromQuestionId,
  spConfigLoyer,
  spConfigResiliation,
  spConfigMoisOfferts,
  spCodesPromo = [],
  spCodesPromoMode = 'addition',
  spCodesPromoMasquerSaisie = false,
  objectifsConfig = [],
  templateId,
  spConfigResumeRef,
  spConfigModeClient,
}: SpQuestionnaireUIProps) {
  const [reponses, setReponses] = useState<SpQuestionReponse[]>(initialReponses ?? []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [messages, setMessages] = useState<MessageBubble[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const EMPTY_ADRESSE: SpAdresse = { societe: '', adresse: '', code_postal: '', ville: '', contact: '', ligne_fixe: '', ligne_mobile: '', email: '', siret: '' };
  const [adresseEdit, setAdresseEdit] = useState<SpAdresse>(EMPTY_ADRESSE);
  // Marge : durée éditable directement dans la question (défaut = config template, sinon 63 mois)
  const [margeDureeMoisOverride, setMargeDureeMoisOverride] = useState<number>(
    spConfigLoyer?.duree_mois_par_defaut ?? 63,
  );
  const [promoApplied, setPromoApplied] = useState<{ nom: string; valeur: number } | null>(null);
  const [promoError, setPromoError] = useState<string>('');
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
  const [pendingFreeEntry, setPendingFreeEntry] = useState<{
    instanceId: string;
    draft: FreeEntryDraft;
  } | null>(null);
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [editingDiscountFor, setEditingDiscountFor] = useState<string | null>(null);
  const [discountPrixOverrides, setDiscountPrixOverrides] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<QuestionnaireSnapshot[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const hasReportedCompletion = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [objectifsResolved, setObjectifsResolved] = useState<import('@/lib/sp/evaluateObjectifs').ResolvedObjectif[]>([]);
  const [objectifsOverlayState, setObjectifsOverlayState] = useState<'hidden' | 'loading' | 'visible'>('hidden');

  const [showResumeRefPopup, setShowResumeRefPopup] = useState(false);
  const [showLoyerPopup, setShowLoyerPopup] = useState(false);

  // Mode client
  const [modeClientActif, setModeClientActif] = useState(spConfigModeClient?.actif ?? false);
  const [widgetsVisibles, setWidgetsVisibles] = useState(
    !(spConfigModeClient?.actif && spConfigModeClient?.masquer_widgets_par_defaut),
  );

  // Drag state for the widget container
  const [widgetPos, setWidgetPos] = useState<{ x: number; y: number } | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingWidget = useRef(false);
  const widgetDragOffset = useRef({ x: 0, y: 0 });

  const confettiPieces = useMemo(() => {
    const colors = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 8,
      duration: 2.5 + Math.random() * 2,
      delay: Math.random() * 1.5,
      rotate: Math.random() * 360,
      isCircle: Math.random() > 0.5,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setAdresseEdit(EMPTY_ADRESSE);
    setHiddenByConsequence(new Set());
    setShownByConsequence(new Set());
    setDynamicFilters(new Map());
    setPendingCatalogueSelection(null);
    setPendingFreeEntry(null);
    setPromoApplied(null);
    setPromoError('');
    setHistory([]);
    hasReportedCompletion.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, []);

  // Widget drag — mouse events on window to support moving outside the element
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingWidget.current || !widgetContainerRef.current) return;
      const { width, height } = widgetContainerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(window.innerWidth - width, e.clientX - widgetDragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - height, e.clientY - widgetDragOffset.current.y));
      setWidgetPos({ x, y });
    };
    const handleMouseUp = () => { isDraggingWidget.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
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
              displayLabel: resolveTemplateText(`[${iterLabel}] ${lq.libelle}`, donneesExtraites, reponses, iter),
              iterationIndex: iter,
              iterationLabel: iterLabel,
            });
          }
        }
      } else if (!q.groupe_boucle_id) {
        result.push({
          question: q,
          instanceId: q.id,
          displayLabel: resolveTemplateText(q.libelle, donneesExtraites, reponses),
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

  // ── Mode client : skip silencieux des questions sensibles ────────────────────
  const autoSkipQuestion = useCallback((
    eq: ExpandedQuestion,
    skipValue: SpQuestionReponse['valeur'],
    extraReponses: SpQuestionReponse[] = [],
  ) => {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    const rep: SpQuestionReponse = { question_id: eq.instanceId, valeur: skipValue };
    const nextReps = [
      ...reponses.filter((r) => r.question_id !== eq.instanceId && !extraReponses.some((er) => er.question_id === r.question_id)),
      rep,
      ...extraReponses,
    ];
    setReponses(nextReps);
    const { newHidden, newShown } = processConsequences(eq.question.consequences ?? [], skipValue, hiddenByConsequence, shownByConsequence);
    const nextIdx = findNextVisibleIndex(currentIdx, nextReps, newHidden, newShown);
    if (nextIdx < expandedQuestions.length) showQuestion(nextIdx, nextReps);
    else setCurrentIdx(expandedQuestions.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reponses, currentIdx, hiddenByConsequence, shownByConsequence, expandedQuestions]);

  useEffect(() => {
    if (!modeClientActif || isTyping) return;
    const eq = currentIdx < expandedQuestions.length ? expandedQuestions[currentIdx] : null;
    if (!eq) return;
    const aff = eq.question.affichage;
    if (spConfigModeClient?.passer_question_marge && aff === 'marge') {
      autoSkipQuestion(eq, '0', [{ question_id: 'sp_marge_calculee', valeur: '0' }]);
    } else if (spConfigModeClient?.passer_question_code_promo && aff === 'code_promo') {
      autoSkipQuestion(eq, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, modeClientActif]);

  const showQuestion = (idx: number, activeReponses = reponses) => {
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
      setMessages((prev) => [...prev, {
        from: 'bot',
        text: resolveTemplateText(eq.displayLabel, donneesExtraites, activeReponses, eq.iterationIndex),
      }]);
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
    
    // Nettoyer les réponses auxiliaires prix_* si on revient sur une question de type remise_produits
    const eq = expandedQuestions[currentIdx];
    if (eq && eq.question.affichage === 'remise_produits') {
      const nextReponses = reponses.filter((r) => !r.question_id.startsWith('prix_' + eq.instanceId));
      setReponses(nextReponses);
    }
    
    setHistory((prev) => prev.slice(0, -1));
    setReponses(snapshot.reponses);
    setMessages(snapshot.messages);
    setHiddenByConsequence(snapshot.hiddenByConsequence);
    setShownByConsequence(snapshot.shownByConsequence);
    setDynamicFilters(snapshot.dynamicFilters);
    setCurrentIdx(snapshot.currentIdx);
    setIsTyping(false);
    setInputValue('');
    setAdresseEdit(EMPTY_ADRESSE);
    setPendingCatalogueSelection(null);
    setPendingFreeEntry(null);
    setPromoApplied(null);
    setPromoError('');
  };

  const skipCurrentQuestion = () => {
    if (!currentExpanded || !currentQuestion || currentQuestion.obligatoire) return;

    setHistory((prev) => [...prev, {
      reponses: [...reponses],
      messages: [...messages],
      hiddenByConsequence: new Set(hiddenByConsequence),
      shownByConsequence: new Set(shownByConsequence),
      dynamicFilters: new Map(dynamicFilters),
      currentIdx,
    }]);

    setMessages((prev) => [...prev, { from: 'user', text: 'Passer' }]);
    setInputValue('');
    setCatalogueSearch('');
    setAdresseEdit(EMPTY_ADRESSE);
    setPendingCatalogueSelection(null);
    setPendingFreeEntry(null);
    setPromoApplied(null);
    setPromoError('');

    const nextIdx = findNextVisibleIndex(currentIdx, reponses, hiddenByConsequence, shownByConsequence);
    if (nextIdx < expandedQuestions.length) {
      showQuestion(nextIdx);
    } else {
      setCurrentIdx(expandedQuestions.length);
    }
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
      if (jumpIdx >= 0) { showQuestion(jumpIdx, nextReps); return; }
    }

    // Use freshly computed sets so consequence-hidden questions are correctly skipped
    const nextIdx = findNextVisibleIndex(currentIdx, nextReps, newHidden, newShown);
    if (nextIdx < expandedQuestions.length) {
      showQuestion(nextIdx, nextReps);
    } else {
      setCurrentIdx(expandedQuestions.length);
    }
  };

  const currentExpanded = currentIdx < expandedQuestions.length ? expandedQuestions[currentIdx] : null;
  const currentQuestionVisible = currentExpanded !== null && isQuestionVisible(currentExpanded);
  const currentQuestion = currentQuestionVisible ? currentExpanded.question : null;

  // Sync inputValue when landing on a "marge" question (bidirectional sync with widget)
  useEffect(() => {
    if (!currentQuestion || currentQuestion.affichage !== 'marge') return;
    const margeRep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
    if (margeRep) {
      setInputValue(String(margeRep.valeur));
    }
  }, [currentQuestion, reponses]);

  useEffect(() => {
    if (!currentQuestion || currentQuestion.affichage !== 'adresse_complete') return;
    if (currentQuestion.sa_prefill === false) return;
    const get = (path: string) => {
      const v = getNestedValue(donneesExtraites, path);
      return typeof v === 'string' ? v : (v != null ? String(v) : '');
    };
    const nom = get('client.nom');
    const prenom = get('client.prenom');
    const contact = [nom, prenom].filter(Boolean).join(' ');
    setAdresseEdit({
      societe:       get('client.raison_sociale'),
      adresse:       get('client.adresse'),
      code_postal:   get('client.code_postal'),
      ville:         get('client.ville'),
      contact,
      ligne_fixe:    get('client.fixe'),
      ligne_mobile:  get('client.mobile'),
      email:         get('client.email'),
      siret:         get('client.siret') || get('client.siren'),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExpanded?.instanceId]);
  const resiliationEstimation = useMemo(() => {
    if (
      !currentQuestion ||
      currentQuestion.affichage !== 'nombre' ||
      currentQuestion.nombre_config?.suggestion_source !== 'indemnite_resiliation'
    ) {
      return null;
    }

    return estimateResiliationFromSA(
      donneesExtraites?.situation_actuelle
        ? donneesExtraites
        : { situation_actuelle: donneesExtraites },
      spConfigResiliation,
    );
  }, [currentQuestion, donneesExtraites, spConfigResiliation]);

  const currentCatalogueOptions: CatalogueProduit[] = (() => {
    if (!currentQuestion || currentQuestion.source !== 'catalogue') return [];
    let filtered = catalogue.filter((p) => p.actif);
    if (currentQuestion.filtres_catalogue) filtered = filterCatalogueByFiltre(filtered, currentQuestion.filtres_catalogue);
    const dynFilter = currentExpanded ? dynamicFilters.get(currentQuestion.id) ?? dynamicFilters.get(currentExpanded.instanceId) : undefined;
    if (dynFilter) filtered = filterCatalogueByFiltre(filtered, dynFilter);
    if (currentQuestion.nombre_max_resultats) filtered = filtered.slice(0, currentQuestion.nombre_max_resultats);
    return filtered;
  })();

  const isCatalogueQuestion = currentQuestion?.source === 'catalogue';
  const currentDiscountProducts = currentQuestion?.affichage === 'remise_produits'
    ? getEligibleDiscountProducts({
      rules: discountRules,
      products: catalogue,
      reponses,
      donneesExtraites,
    })
    : [];
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

  useEffect(() => {
    if (!isSimulation || !isDone || hasReportedCompletion.current) return;
    hasReportedCompletion.current = true;
    onComplete(reponses);
  }, [isSimulation, isDone, onComplete, reponses]);

  // Résumé+Ref popup: trigger when landing on a resume_ref question
  useEffect(() => {
    if (!currentQuestion || currentQuestion.affichage !== 'resume_ref' || isTyping) return;
    setShowResumeRefPopup(true);
  }, [currentQuestion, isTyping]);

  // Loyer popup: trigger when landing on an affichage_loyer question
  useEffect(() => {
    if (!currentQuestion || currentQuestion.affichage !== 'affichage_loyer' || isTyping) return;
    setShowLoyerPopup(true);
  }, [currentQuestion, isTyping]);

  // Objectifs popup: trigger when questionnaire completes
  useEffect(() => {
    if (!isDone) {
      setObjectifsOverlayState('hidden');
      return;
    }
    if (objectifsConfig.length === 0 || !templateId) return;

    const resolved = evaluateObjectifsForRender(objectifsConfig, templateId, reponses, null, catalogue);
    if (resolved.length === 0) return;

    setObjectifsResolved(resolved);
    setObjectifsOverlayState('loading');

    const timer = setTimeout(() => setObjectifsOverlayState('visible'), 2000);
    return () => clearTimeout(timer);
  }, [isDone, objectifsConfig, templateId, reponses]);

  return (
    <div className="space-y-4">
      {/* Objectifs Accomplis — portal popup rendered at document.body to escape stacking context */}
      {objectifsOverlayState !== 'hidden' && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Confetti layer */}
          {objectifsOverlayState === 'visible' && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {confettiPieces.map((p) => (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    left: `${p.x}%`,
                    top: '-20px',
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    backgroundColor: p.color,
                    borderRadius: p.isCircle ? '50%' : '2px',
                    animation: `spConfettiFall ${p.duration}s ${p.delay}s ease-in both`,
                    transform: `rotate(${p.rotate}deg)`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Card */}
          <div className="relative z-10 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl">
            {objectifsOverlayState === 'loading' ? (
              <div className="flex flex-col items-center gap-4 py-16 bg-white rounded-2xl">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-gray-600">Analyse de vos objectifs…</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-1">
                <SpObjectifsAccomplis resolvedObjectifs={objectifsResolved} />
                <div className="px-4 pb-4 pt-4 flex justify-center">
                  <Button
                    onClick={() => setObjectifsOverlayState('hidden')}
                    className="px-8 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white border-0"
                  >
                    Continuer
                  </Button>
                </div>
              </div>
            )}
          </div>

          <style>{`
            @keyframes spConfettiFall {
              0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0.3; }
            }
          `}</style>
        </div>,
        document.body
      )}

      {/* Résumé+Ref popup */}
      {showResumeRefPopup && currentExpanded && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
              <h2 className="text-lg font-bold text-white">Récapitulatif de vos réponses</h2>
              <p className="text-sm text-blue-100 mt-0.5">Voici un résumé de vos réponses avant de continuer</p>
            </div>

            {/* Corps — liste des réponses précédentes */}
            <div className="px-6 py-4 max-h-72 overflow-y-auto space-y-2">
              {expandedQuestions.slice(0, currentIdx).filter((eq) =>
                eq.question.affichage !== 'resume_ref' &&
                reponses.some((r) => r.question_id === eq.instanceId)
              ).length === 0 ? (
                <p className="text-sm text-gray-400 italic">Aucune réponse précédente.</p>
              ) : (
                expandedQuestions.slice(0, currentIdx)
                  .filter((eq) =>
                    eq.question.affichage !== 'resume_ref' &&
                    reponses.some((r) => r.question_id === eq.instanceId)
                  )
                  .map((eq) => {
                    const rep = reponses.find((r) => r.question_id === eq.instanceId);
                    return (
                      <div key={eq.instanceId} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-500 truncate">
                            {resolveTemplateText(eq.displayLabel, donneesExtraites, reponses, eq.iterationIndex)}
                          </p>
                          <p className="text-sm text-gray-900 mt-0.5">
                            {rep ? formatReponseText(rep.valeur) : '—'}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Section référence */}
            {(() => {
              const fixe = spConfigResumeRef?.partie_fixe?.trim();
              if (!fixe || !spConfigResumeRef) return null;
              const partieVariable = spConfigResumeRef.partie_variable;
              const cartWithMarge = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts);
              const cartSansMarge = partieVariable === 'loyer_sans_marge'
                ? calculateCartSummary(reponses.filter((r) => r.question_id !== 'sp_marge_calculee'), questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts)
                : null;
              let montant: number | null | undefined = undefined;
              if (partieVariable === 'loyer_avec_marge') {
                montant = cartWithMarge.loyer?.loyer_mensuel;
              } else if (partieVariable === 'loyer_sans_marge') {
                montant = cartSansMarge?.loyer?.loyer_mensuel;
              }
              const refText = montant != null
                ? `${fixe}${Math.ceil(montant)}`
                : fixe;
              return (
                <div className="mx-6 mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-blue-600 mb-1">Référence de la proposition</p>
                  <p className="text-sm font-semibold text-blue-900">{refText}</p>
                </div>
              );
            })()}

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 flex justify-center">
              <Button
                onClick={() => {
                  setShowResumeRefPopup(false);
                  recordAnswer(currentExpanded.instanceId, 'vu');
                }}
                className="px-10 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continuer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Loyer popup */}
      {showLoyerPopup && currentExpanded && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
              <h2 className="text-lg font-bold text-white">Loyer mensuel</h2>
              <p className="text-sm text-blue-100 mt-0.5">Montant calculé sur la base de vos réponses</p>
            </div>
            <div className="px-6 py-6 flex flex-col items-center gap-1">
              {(() => {
                const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts);
                const loyer = cart.loyer?.loyer_mensuel;
                return loyer != null ? (
                  <p className="text-4xl font-bold text-gray-900">
                    {loyer.toFixed(2).replace('.', ',')} €
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Loyer non calculé</p>
                );
              })()}
              <p className="text-xs text-gray-400">par mois</p>
            </div>
            <div className="px-6 pb-6 flex justify-center">
              <Button
                onClick={() => {
                  setShowLoyerPopup(false);
                  recordAnswer(currentExpanded.instanceId, 'vu');
                }}
                className="px-10 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continuer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modeClientActif && spConfigModeClient?.afficher_indicateur_mode_client && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
          <EyeOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-xs font-medium text-amber-700">Mode client actif — tarifs masqués</span>
        </div>
      )}

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
      {currentQuestion && currentExpanded && !isTyping && currentQuestion.affichage !== 'resume_ref' && currentQuestion.affichage !== 'affichage_loyer' && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">
            {resolveTemplateText(currentExpanded.displayLabel, donneesExtraites, reponses, currentExpanded.iterationIndex)}
          </p>
          {currentQuestion.description && (
            <p className="text-xs text-blue-600">
              {resolveTemplateText(currentQuestion.description, donneesExtraites, reponses, currentExpanded.iterationIndex)}
            </p>
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

          {currentQuestion.affichage === 'remise_produits' && (
            <div className="space-y-3">
              {currentDiscountProducts.length > 0 ? (
                <div className="space-y-2">
                  {currentDiscountProducts.map((p) => {
                    const computedPrixRemise = (() => {
                      if (!p.prix_mensuel || !p.remise_valeur) return null;
                      if (p.remise_type === 'fixe') return p.prix_mensuel - p.remise_valeur;
                      if (p.remise_type === 'pourcentage') return p.prix_mensuel * (1 - p.remise_valeur / 100);
                      return null;
                    })();
                    const overrideValue = discountPrixOverrides[p.id];
                    const effectivePrix = overrideValue !== undefined && overrideValue !== ''
                      ? Number(overrideValue.replace(',', '.'))
                      : computedPrixRemise;
                    const remiseLabel = (() => {
                      if (!p.remise_valeur) return '';
                      if (p.remise_type === 'fixe') return `-${p.remise_valeur.toFixed(2).replace('.', ',')} €/mois`;
                      if (p.remise_type === 'pourcentage') return `-${p.remise_valeur}%`;
                      return '';
                    })();
                    const isEditing = editingDiscountFor === p.id;
                    return (
                      <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-green-200 bg-white px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{p.nom}</p>
                            {!(modeClientActif && spConfigModeClient?.masquer_prix_remises) && (
                              <p className="text-xs text-gray-500">
                                {formatPrixProduit(p)} → {effectivePrix != null && Number.isFinite(effectivePrix) ? `${effectivePrix.toFixed(2).replace('.', ',')} €/mois` : '—'}
                              </p>
                            )}
                          </div>
                          {!(modeClientActif && spConfigModeClient?.masquer_prix_remises) && (
                            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                              {remiseLabel}
                            </span>
                          )}
                          {!(modeClientActif && spConfigModeClient?.masquer_bouton_modifier_prix) && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDiscountFor((current) => current === p.id ? null : p.id);
                                if (overrideValue === undefined && computedPrixRemise != null) {
                                  setDiscountPrixOverrides((prev) => ({ ...prev, [p.id]: String(computedPrixRemise) }));
                                }
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                              aria-label={`Modifier le prix remisé de ${p.nom}`}
                              title={`Modifier le prix remisé de ${p.nom}`}
                            >
                              {isEditing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                        {isEditing && !(modeClientActif && spConfigModeClient?.masquer_bouton_modifier_prix) && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 shrink-0">Prix remisé (€ / mois)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={overrideValue ?? (computedPrixRemise != null ? String(computedPrixRemise) : '')}
                              onChange={(e) => setDiscountPrixOverrides((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              className="h-7 w-24 text-sm border border-gray-300 rounded px-2"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                      const priceMap: Record<string, string> = {};
                      currentDiscountProducts.forEach((p) => {
                        const computedPrixRemise = (() => {
                          if (!p.prix_mensuel || !p.remise_valeur) return null;
                          if (p.remise_type === 'fixe') return p.prix_mensuel - p.remise_valeur;
                          if (p.remise_type === 'pourcentage') return p.prix_mensuel * (1 - p.remise_valeur / 100);
                          return null;
                        })();
                        const overrideValue = discountPrixOverrides[p.id];
                        const effectivePrix = overrideValue !== undefined && overrideValue !== ''
                          ? Number(overrideValue.replace(',', '.'))
                          : computedPrixRemise;
                        if (effectivePrix != null && Number.isFinite(effectivePrix)) {
                          priceMap[p.nom] = String(effectivePrix);
                          priceMap[p.id] = String(effectivePrix);
                        }
                      });
                      recordAnswer(currentExpanded.instanceId, true, [{
                        question_id: 'prix_' + currentExpanded.instanceId,
                        valeur: JSON.stringify(priceMap),
                      }]);
                    }}>
                      Appliquer les remises
                    </Button>
                    <Button size="sm" variant="outline" className="bg-white" onClick={() => recordAnswer(currentExpanded.instanceId, false)}>
                      Ne pas appliquer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">Aucun produit sélectionné n’est éligible à une remise.</p>
                  <Button size="sm" variant="outline" className="bg-white" onClick={() => recordAnswer(currentExpanded.instanceId, false)}>
                    Continuer
                  </Button>
                </div>
              )}
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
                        {!(modeClientActif && spConfigModeClient?.masquer_prix_produits) && (prix || fas) && (
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
                <button
                  type="button"
                  onClick={() => setPendingFreeEntry({
                    instanceId: currentExpanded.instanceId,
                    draft: { label: '', prix: '', categorie: 'equipement' },
                  })}
                  className={`text-left px-3 py-2 rounded-md border border-dashed transition-colors ${
                    pendingFreeEntry?.instanceId === currentExpanded.instanceId
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-blue-700 border-blue-300 hover:border-blue-500'
                  }`}
                >
                  <div className="text-sm font-medium">{FREE_ENTRY_LABEL}</div>
                </button>
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
                value={(() => {
                  if (pendingCatalogueSelection?.instanceId === currentExpanded.instanceId) return pendingCatalogueSelection.product.nom;
                  if (pendingFreeEntry?.instanceId === currentExpanded.instanceId) return FREE_ENTRY_MARKER;
                  return '';
                })()}
                onChange={(e) => {
                  if (!e.target.value) return;
                  if (e.target.value === FREE_ENTRY_MARKER) {
                    setPendingFreeEntry({
                      instanceId: currentExpanded.instanceId,
                      draft: { label: '', prix: '', categorie: 'equipement' },
                    });
                    return;
                  }
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
                    const prix = !(modeClientActif && spConfigModeClient?.masquer_prix_produits) ? formatPrixProduit(p) : null;
                    const fas = !(modeClientActif && spConfigModeClient?.masquer_prix_produits) && p.prix_installation != null ? `FAS: ${p.prix_installation.toFixed(2).replace('.', ',')} €` : null;
                    return <option key={p.nom} value={p.nom}>{[p.nom, prix, fas].filter(Boolean).join(' · ')}</option>;
                  })
                  : (currentQuestion.options_manuelles ?? (isCatalogueQuestion ? [] : fournisseurs)).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                {currentQuestion.options_libres && (
                  <option value={FREE_ENTRY_MARKER}>{FREE_ENTRY_LABEL}</option>
                )}
              </select>
            </div>
          )}

          {currentQuestion.affichage === 'boutons_choix_multiple' && (
            currentCatalogueOptions.length > 0 ? (
              <CatalogueMultipleChoiceInput
                products={currentCatalogueOptions}
                allowFreeEntry={!!currentQuestion.options_libres}
                hidePrice={modeClientActif && (spConfigModeClient?.masquer_prix_produits ?? true)}
                hidePrixEditing={modeClientActif && (spConfigModeClient?.masquer_bouton_modifier_prix ?? true)}
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
                    if (r.question_id === '__libre_placeholder__') {
                      return { ...r, question_id: 'libre_' + currentExpanded.instanceId };
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
                allowFreeEntry={!!currentQuestion.options_libres}
                hidePrice={modeClientActif && (spConfigModeClient?.masquer_prix_produits ?? true)}
                hidePrixEditing={modeClientActif && (spConfigModeClient?.masquer_bouton_modifier_prix ?? true)}
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
                    if (r.question_id === '__libre_placeholder__') {
                      return { ...r, question_id: 'libre_' + currentExpanded.instanceId };
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
            <div className="space-y-3">
              {currentQuestion.affichage === 'nombre' && resiliationEstimation && (
                <div className="space-y-2">
                  {(() => {
                    const groupedCalculation = hasGroupedResiliationCalculation(resiliationEstimation);
                    const groupedCount = resiliationEstimation.groupes_calcul.filter((group) => group.sous_total !== null).length;
                    const remainingMonthsLabel = formatResiliationRemainingMonths(
                      resiliationEstimation.mois_restants,
                      resiliationEstimation.mois_restants_avant_preavis,
                      resiliationEstimation.preavis_mois,
                    );
                    return (
                      <>
                  {currentQuestion.nombre_config?.afficher_estimation !== false && !(modeClientActif && spConfigModeClient?.masquer_estimation_resiliation) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-amber-800">Estimation indemnité de résiliation</p>
                          <p className="text-lg font-semibold text-amber-950">
                            {resiliationEstimation.montant_retenu !== null
                              ? formatResiliationMoney(resiliationEstimation.montant_retenu)
                              : 'Aucune estimation disponible'}
                          </p>
                          <p className="text-xs text-amber-700">{resiliationEstimation.calcul_resume}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getResiliationFiabiliteClasses(resiliationEstimation.fiabilite)}`}>
                          Fiabilité {resiliationEstimation.fiabilite}
                        </span>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="rounded-md bg-white/80 border border-amber-100 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Source retenue</p>
                          <p className="text-sm text-gray-800 mt-1">{resiliationEstimation.source_retenue_label}</p>
                        </div>
                        <div className="rounded-md bg-white/80 border border-amber-100 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Date de référence</p>
                          <p className="text-sm text-gray-800 mt-1">{resiliationEstimation.date_reference}</p>
                        </div>
                        <div className="rounded-md bg-white/80 border border-amber-100 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Préavis retenu</p>
                          <p className="text-sm text-gray-800 mt-1">{resiliationEstimation.preavis_mois} mois</p>
                        </div>
                      </div>
                      {remainingMonthsLabel && (
                        <div className="rounded-md bg-white/80 border border-amber-100 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Mois restants retenus</p>
                          <p className="text-sm text-gray-800 mt-1">{remainingMonthsLabel}</p>
                        </div>
                      )}

                      <div className="space-y-1 text-xs text-amber-800">
                        <p>{resiliationEstimation.explication_fiabilite}</p>
                        {groupedCalculation && groupedCount > 0 && (
                          <p>
                            Calcul retenu: somme de {groupedCount} groupe{groupedCount > 1 ? 's' : ''} engagé{groupedCount > 1 ? 's' : ''} avec leur propre base mensuelle et leurs mois restants.
                          </p>
                        )}
                        {resiliationEstimation.composants
                          .filter((component) => component.id !== 'total' && component.inclus && component.disponible)
                          .slice(0, 3)
                          .map((component) => (
                            <p key={component.id}>
                              {component.label}: {component.formule ?? formatResiliationMoney(component.montant)}
                              {component.formule && component.montant !== null ? ` = ${formatResiliationMoney(component.montant)}` : ''}
                            </p>
                          ))}
                      </div>
                    </div>
                  )}

                  {currentQuestion.nombre_config?.afficher_detail_calcul && !(modeClientActif && spConfigModeClient?.masquer_estimation_resiliation) && (
                    <details className="rounded-lg border border-gray-200 bg-white p-3 group">
                      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Détail du calcul</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Décomposition, hypothèses, preuves SA et groupes d&apos;engagement
                          </p>
                        </div>
                        <span className="text-xs text-blue-600 group-open:hidden">Afficher</span>
                        <span className="text-xs text-blue-600 hidden group-open:inline">Masquer</span>
                      </summary>

                      <div className="mt-4 space-y-4">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-xs font-semibold text-gray-700">Décomposition du montant</p>
                          <div className="mt-2 space-y-2">
                            {resiliationEstimation.composants
                              .filter((component) => component.inclus)
                              .map((component) => (
                                <div key={component.id} className="flex items-start justify-between gap-3 text-xs">
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-800">{component.label}</p>
                                    {component.formule && (
                                      <p className="text-gray-500 mt-0.5">{component.formule}</p>
                                    )}
                                    {!component.disponible && component.id !== 'total' && (
                                      <p className="text-gray-400 mt-0.5">Non trouvé dans la SA</p>
                                    )}
                                  </div>
                                  <span className="shrink-0 font-medium text-gray-800">
                                    {formatResiliationMoney(component.montant)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {resiliationEstimation.hypotheses.length > 0 && (
                          <div className="rounded-lg border border-gray-100 bg-white p-3">
                            <p className="text-xs font-semibold text-gray-700">Hypothèses retenues</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              {resiliationEstimation.hypotheses.map((hypothese) => (
                                <div key={`${hypothese.label}-${hypothese.valeur}`} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-wide text-gray-500">{hypothese.label}</p>
                                  <p className="text-xs text-gray-800 mt-1">{hypothese.valeur}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {resiliationEstimation.groupes_calcul.length > 0 && (
                          <div className="rounded-lg border border-gray-100 bg-white p-3">
                            <p className="text-xs font-semibold text-gray-700">Groupes de calcul</p>
                            {groupedCalculation && (
                              <p className="text-xs text-gray-500 mt-1">
                                Chaque groupe applique sa propre mensualité SA et ses propres mois restants, puis les sous-totaux sont additionnés.
                              </p>
                            )}
                            <div className="mt-2 space-y-3">
                              {resiliationEstimation.groupes_calcul.map((groupe) => {
                                const groupRemainingMonthsLabel = formatResiliationRemainingMonths(
                                  groupe.mois_restants,
                                  groupe.mois_avant_preavis,
                                  resiliationEstimation.preavis_mois,
                                );

                                return (
                                  <div key={groupe.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800">{groupe.libelle}</p>
                                        <p className="text-xs text-gray-500 mt-1">{groupe.methode}</p>
                                      </div>
                                      {groupe.sous_total !== null && (
                                        <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">
                                          {formatResiliationMoney(groupe.sous_total)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
                                      {groupRemainingMonthsLabel && (
                                        <span className="rounded-full border border-gray-200 bg-white px-2 py-1">
                                          {groupRemainingMonthsLabel}
                                        </span>
                                      )}
                                      {groupe.base_mensuelle !== null && (
                                        <span className="rounded-full border border-gray-200 bg-white px-2 py-1">
                                          Base {formatResiliationMoney(groupe.base_mensuelle)} / mois
                                        </span>
                                      )}
                                    </div>
                                    {groupe.preuves.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        {groupe.preuves.map((preuve) => (
                                          <div key={preuve.id} className="rounded-md border border-white bg-white px-3 py-2">
                                            <p className="text-xs font-medium text-gray-800">{preuve.label}</p>
                                            <p className="text-xs text-gray-700 mt-1">{preuve.valeur}</p>
                                            {preuve.contexte && (
                                              <p className="text-[11px] text-gray-500 mt-1">{preuve.contexte}</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {resiliationEstimation.preuves.length > 0 && (
                          <div className="rounded-lg border border-gray-100 bg-white p-3">
                            <p className="text-xs font-semibold text-gray-700">Preuves trouvées dans la SA</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              {resiliationEstimation.preuves.map((preuve) => (
                                <div key={preuve.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                                  <p className="text-xs font-medium text-gray-800">{preuve.label}</p>
                                  <p className="text-xs text-gray-700 mt-1">{preuve.valeur}</p>
                                  {preuve.contexte && (
                                    <p className="text-[11px] text-gray-500 mt-1">{preuve.contexte}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {resiliationEstimation.motifs_manquants.length > 0 && (
                          <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                            <p className="text-xs font-semibold text-red-700">Informations manquantes</p>
                            <ul className="text-xs text-red-700 mt-2 space-y-1">
                              {resiliationEstimation.motifs_manquants.map((detail) => (
                                <li key={detail}>- {detail}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="flex gap-2">
                <input value={inputValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                  placeholder={currentQuestion.affichage === 'nombre' && resiliationEstimation?.montant_retenu != null ? String(resiliationEstimation.montant_retenu) : 'Votre réponse...'}
                  type={currentQuestion.affichage === 'nombre' ? 'number' : 'text'}
                  className="h-8 text-sm border border-gray-300 rounded px-2 flex-1"
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); }
                  }} />
                <Button size="sm" onClick={() => { if (inputValue.trim()) { recordAnswer(currentExpanded.instanceId, inputValue.trim()); setInputValue(''); } }}>
                  Valider
                </Button>
              </div>
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

          {currentQuestion.affichage === 'marge' && (() => {
            // 1. Priorité : config template "duree_depends_question" → lit la réponse à la question SP choisie.
            // 2. Fallback compat : ancienne détection via conséquence renseigner_variable=sp_duree_mois.
            // 3. Sinon : override local (initialisé sur duree_mois_par_defaut du template).
            let dureeQuestionId: string | undefined;
            if (spConfigLoyer?.duree_depends_question && spConfigLoyer.duree_question_id) {
              dureeQuestionId = spConfigLoyer.duree_question_id;
            } else {
              const dureeQuestion = questions.find((q) =>
                q.consequences?.some(
                  (c) => c.type === 'renseigner_variable' && c.variable_cible === 'sp_duree_mois'
                )
              );
              dureeQuestionId = dureeQuestion?.id;
            }
            const dureeRep = dureeQuestionId
              ? reponses.find(
                  (r) =>
                    r.question_id === dureeQuestionId ||
                    r.question_id.startsWith(`${dureeQuestionId}__iter_`),
                )
              : undefined;
            let dureeFromReponse = 0;
            if (dureeRep) {
              const raw = Array.isArray(dureeRep.valeur) ? dureeRep.valeur[0] : dureeRep.valeur;
              const match = String(raw ?? '').match(/-?\d+(?:[.,]\d+)?/);
              const parsed = match ? Number(match[0].replace(',', '.')) : NaN;
              if (Number.isFinite(parsed) && parsed > 0) dureeFromReponse = parsed;
            }
            const dureeMois = dureeFromReponse || margeDureeMoisOverride;

            const margeNum = Number(inputValue) || 0;
            const baremes = (spConfigLoyer ?? DEFAULT_CONFIG_LOYER).baremes;
            const bareme = findApplicableBareme(baremes, reponses, donneesExtraites, catalogue);
            // Calcule la base loyer en excluant la marge déjà enregistrée (on utilise la saisie courante)
            const reponsesSansMarge = reponses.filter((r) => r.question_id !== 'sp_marge_calculee');
            const baseSummary = calculateCartSummary(
              reponsesSansMarge,
              questions,
              catalogue,
              donneesExtraites,
              spConfigLoyer,
              spConfigMoisOfferts,
            );
            const baseAvantMarge =
              baseSummary.totalPonctuel + baseSummary.remiseMoisOffert + baseSummary.indemnites;
            const baseLoyer = baseAvantMarge + margeNum;
            const loyer = calculerLoyer(bareme, baseLoyer, dureeMois);

            return (
              <div className="space-y-3">
                {/* Champ Marge */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ex : 500"
                    className="h-8 w-32 text-sm border border-gray-300 rounded px-2"
                  />
                  <span className="text-sm text-gray-500">€ de marge</span>
                </div>

                {/* Durée éditable si pas renseignée par une question */}
                {!dureeFromReponse && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Durée du contrat :</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={margeDureeMoisOverride}
                      onChange={(e) => setMargeDureeMoisOverride(Number(e.target.value) || 63)}
                      className="h-7 w-20 text-sm border border-gray-300 rounded px-2"
                    />
                    <span className="text-xs text-gray-500">mois</span>
                  </div>
                )}

                {/* Détail base loyer — masqué en mode client si masquer_details_marge */}
                {!(modeClientActif && spConfigModeClient?.masquer_details_marge) && (
                  <>
                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1 text-xs">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Base du calcul
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Total ponctuel (matériel + FAS + installations + cadeaux)</span>
                        <span className="tabular-nums">{baseSummary.totalPonctuel.toFixed(2)} €</span>
                      </div>
                      {baseSummary.remiseMoisOffert > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">
                            Remise mois offert ({baseSummary.loyer?.mois_offerts ?? 0} × {baseSummary.abonnements.totalMensuel.toFixed(2)} €)
                          </span>
                          <span className="tabular-nums">{baseSummary.remiseMoisOffert.toFixed(2)} €</span>
                        </div>
                      )}
                      {baseSummary.indemnites > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Indemnités de résiliation</span>
                          <span className="tabular-nums">{baseSummary.indemnites.toFixed(2)} €</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Marge saisie</span>
                        <span className="tabular-nums">{margeNum.toFixed(2)} €</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-gray-200 font-semibold text-gray-900">
                        <span>Base loyer</span>
                        <span className="tabular-nums">{baseLoyer.toFixed(2)} €</span>
                      </div>
                    </div>

                    {loyer ? (
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            Loyer mensuel HT
                            <span className="block text-[10px] text-gray-400">
                              ({baseLoyer.toFixed(2)} × {(loyer.taux_utilise * 100).toFixed(2)}%) / 3
                            </span>
                          </span>
                          <span className="font-semibold text-blue-800">{loyer.loyer_mensuel.toFixed(2)} €</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Loyer trimestriel HT</span>
                          <span className="font-semibold text-blue-800">{loyer.loyer_trimestriel.toFixed(2)} €</span>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500 pt-1 border-t border-blue-100">
                          <span>Durée : {loyer.duree_mois} mois</span>
                          <span>Trimestres : {loyer.trimestres}</span>
                          <span>Mois offerts : {loyer.mois_offerts}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">
                        Aucun barème applicable pour {dureeMois} mois. Configurez-en un dans Paramètres → Calculer Loyer.
                      </p>
                    )}
                  </>
                )}

                <Button
                  size="sm"
                  onClick={() => {
                    const margeVal = inputValue || '0';
                    const extras: SpQuestionReponse[] = [
                      { question_id: 'sp_marge_calculee', valeur: margeVal },
                    ];
                    if (loyer) {
                      extras.push({ question_id: 'sp_loyer_mensuel_calculee', valeur: String(loyer.loyer_mensuel) });
                      extras.push({ question_id: 'sp_loyer_trimestriel_calculee', valeur: String(loyer.loyer_trimestriel) });
                    }
                    recordAnswer(currentExpanded.instanceId, margeVal, extras);
                    setInputValue('');
                  }}
                >
                  Valider
                </Button>
              </div>
            );
          })()}

          {currentQuestion.affichage === 'code_promo' && (() => {
            const baremes = (spConfigLoyer ?? DEFAULT_CONFIG_LOYER).baremes;
            const bareme = findApplicableBareme(baremes, reponses, donneesExtraites, catalogue);
            let dureeQuestionId: string | undefined;
            if (spConfigLoyer?.duree_depends_question && spConfigLoyer.duree_question_id) {
              dureeQuestionId = spConfigLoyer.duree_question_id;
            } else {
              const dureeQuestion = questions.find((q) =>
                q.consequences?.some((c) => c.type === 'renseigner_variable' && c.variable_cible === 'sp_duree_mois')
              );
              dureeQuestionId = dureeQuestion?.id;
            }
            const dureeRep = dureeQuestionId
              ? reponses.find((r) => r.question_id === dureeQuestionId)
              : undefined;
            let dureeFromReponse = 0;
            if (dureeRep) {
              const raw = Array.isArray(dureeRep.valeur) ? dureeRep.valeur[0] : dureeRep.valeur;
              const match = String(raw ?? '').match(/-?\d+(?:[.,]\d+)?/);
              const parsed = match ? Number(match[0].replace(',', '.')) : NaN;
              if (Number.isFinite(parsed) && parsed > 0) dureeFromReponse = parsed;
            }
            const dureeMois = dureeFromReponse || margeDureeMoisOverride;

            const applyPromo = (code: string) => {
              const found = spCodesPromo.find((c) => c.nom.toLowerCase() === code.trim().toLowerCase());
              if (!found) { setPromoApplied(null); setPromoError('Code promo invalide'); return; }
              setPromoError('');
              const existingMargeRep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
              const existingMarge = existingMargeRep ? Number(existingMargeRep.valeur) || 0 : 0;
              const margeNum = spCodesPromoMode === 'soustraction' ? existingMarge - found.valeur : existingMarge + found.valeur;
              const margeVal = String(margeNum);
              const reponsesSansPromo = reponses.filter((r) => r.question_id !== 'sp_marge_calculee');
              const baseSummary = calculateCartSummary(reponsesSansPromo, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts);
              const baseLoyer = baseSummary.totalPonctuel + baseSummary.remiseMoisOffert + baseSummary.indemnites + margeNum;
              const loyer = calculerLoyer(bareme, baseLoyer, dureeMois);
              const extras: SpQuestionReponse[] = [
                { question_id: 'sp_marge_calculee', valeur: margeVal },
                // Détail du code promo (pour affichage panier + export comparatif)
                { question_id: 'sp_marge_avant_promo', valeur: String(existingMarge) },
                { question_id: 'sp_code_promo_nom', valeur: found.nom },
                { question_id: 'sp_code_promo_valeur', valeur: String(found.valeur) },
                { question_id: 'sp_code_promo_mode', valeur: spCodesPromoMode },
              ];
              if (loyer) {
                extras.push({ question_id: 'sp_loyer_mensuel_calculee', valeur: String(loyer.loyer_mensuel) });
                extras.push({ question_id: 'sp_loyer_trimestriel_calculee', valeur: String(loyer.loyer_trimestriel) });
              }
              // Affiche la confirmation 1 seconde, puis valide et passe à la suite
              setPromoApplied({ nom: found.nom, valeur: found.valeur });
              setTimeout(() => {
                recordAnswer(currentExpanded.instanceId, margeVal, extras);
                setInputValue('');
                setPromoApplied(null);
                setPromoError('');
              }, 1000);
            };

            return (
              <div className="space-y-3">
                {promoApplied ? (
                  <p className="text-sm font-medium text-green-700">
                    {spCodesPromoMasquerSaisie
                      ? '✓ Code promo appliqué'
                      : <>✓ Code <span className="font-mono">{promoApplied.nom}</span> appliqué</>}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type={spCodesPromoMasquerSaisie ? 'password' : 'text'}
                        value={inputValue}
                        onChange={(e) => { setInputValue(e.target.value); setPromoError(''); }}
                        placeholder="Entrez votre code promo"
                        className={`h-8 text-sm border border-gray-300 rounded px-2 flex-1 font-mono${spCodesPromoMasquerSaisie ? '' : ' uppercase'}`}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyPromo(inputValue); }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyPromo(inputValue)}
                      >
                        Appliquer votre code promo
                      </Button>
                    </div>
                    {promoError && (
                      <p className="text-xs text-red-600">{promoError}</p>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {currentQuestion.affichage === 'adresse_complete' && (
            <div className="space-y-1.5">
              <input placeholder="Société" value={adresseEdit.societe ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, societe: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full" />
              <input placeholder="Adresse (rue, numéro) *" value={adresseEdit.adresse}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, adresse: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full" />
              <div className="flex gap-2">
                <input placeholder="C.P. *" value={adresseEdit.code_postal}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, code_postal: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 w-28" />
                <input placeholder="Ville *" value={adresseEdit.ville}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, ville: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 flex-1" />
              </div>
              <input placeholder="Contact (nom prénom)" value={adresseEdit.contact ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, contact: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full" />
              <div className="flex gap-2">
                <input placeholder="Ligne fixe" value={adresseEdit.ligne_fixe ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, ligne_fixe: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 flex-1" />
                <input placeholder="Ligne mobile" value={adresseEdit.ligne_mobile ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, ligne_mobile: e.target.value }))}
                  className="h-8 text-sm border border-gray-300 rounded px-2 flex-1" />
              </div>
              <input placeholder="Adresse e-mail" value={adresseEdit.email ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, email: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full" />
              <input placeholder="Numéro de SIRET" value={adresseEdit.siret ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdresseEdit((p) => ({ ...p, siret: e.target.value }))}
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full" />
              <Button size="sm" disabled={!adresseEdit.adresse || !adresseEdit.code_postal || !adresseEdit.ville}
                onClick={() => { recordAnswer(currentExpanded.instanceId, { ...adresseEdit }); setAdresseEdit(EMPTY_ADRESSE); }}>
                Valider
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
                {!(modeClientActif && spConfigModeClient?.masquer_prix_confirmation) && formatProduitPrixValue(pendingCatalogueSelection.prixValue, pendingCatalogueSelection.product) && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Unitaire: {formatProduitPrixValue(pendingCatalogueSelection.prixValue, pendingCatalogueSelection.product)}
                  </span>
                )}
                {!(modeClientActif && spConfigModeClient?.masquer_prix_confirmation) && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Total: {formatProduitTotalValue(
                      pendingCatalogueSelection.prixValue,
                      pendingCatalogueSelection.product,
                      pendingCatalogueSelection.quantityValue,
                    ) ?? '0,00 €'}
                  </span>
                )}
                {!(modeClientActif && spConfigModeClient?.masquer_prix_confirmation) && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {shouldMultiplyFas(pendingCatalogueSelection.product)
                      ? formatProduitFasTotalValue(pendingCatalogueSelection.fasValue, pendingCatalogueSelection.quantityValue)
                      : formatProduitFasValue(pendingCatalogueSelection.fasValue)}
                  </span>
                )}
                {!(modeClientActif && spConfigModeClient?.masquer_bouton_modifier_prix) && (
                  <button
                    type="button"
                    onClick={() => setPendingCatalogueSelection((prev) => prev ? { ...prev, prixEditing: !prev.prixEditing } : null)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                    aria-label="Modifier le prix et le FAS"
                    title="Modifier le prix et le FAS"
                  >
                    {pendingCatalogueSelection.prixEditing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 shrink-0">Quantité :</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={pendingCatalogueSelection.quantityValue}
                  onChange={(e) => {
                    const newQty = e.target.value;
                    setPendingCatalogueSelection((prev) => {
                      if (!prev) return null;
                      if (!prev.prixEditing) {
                        const resolved = resolvePrixPourQuantite(prev.product, Number(newQty) || 1);
                        const prixValue = prev.product.type_frequence === 'mensuel'
                          ? (resolved.prix_mensuel?.toString() ?? '')
                          : (resolved.prix_vente?.toString() ?? '');
                        const fasValue = resolved.prix_installation?.toString() ?? '0';
                        return { ...prev, quantityValue: newQty, prixValue, fasValue };
                      }
                      return { ...prev, quantityValue: newQty };
                    });
                  }}
                  className="h-7 w-20 text-sm border border-gray-300 rounded px-2"
                />
              </div>
              {(() => {
                const resolved = resolvePrixPourQuantite(
                  pendingCatalogueSelection.product,
                  Number(pendingCatalogueSelection.quantityValue) || 1,
                );
                return resolved.tranche_active && !pendingCatalogueSelection.prixEditing ? (
                  <p className="text-xs text-blue-600">
                    Prix appliqué selon tranche ({resolved.tranche_label})
                  </p>
                ) : null;
              })()}
              {pendingCatalogueSelection.prixEditing && !(modeClientActif && spConfigModeClient?.masquer_bouton_modifier_prix) && (
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
                setPendingFreeEntry(null);
              }}>
                Valider
              </Button>
            </div>
          )}

          {/* Zone de confirmation pour saisie libre ("Autre valeur") */}
          {pendingFreeEntry?.instanceId === currentExpanded.instanceId && (
            <div className="mt-1 p-3 bg-white border border-blue-300 rounded-lg space-y-3">
              <p className="text-sm font-medium text-blue-900">{FREE_ENTRY_LABEL}</p>
              <FreeEntryForm
                draft={pendingFreeEntry.draft}
                onChange={(next) => setPendingFreeEntry((prev) => prev ? { ...prev, draft: next } : null)}
                hidePrix={modeClientActif && (spConfigModeClient?.masquer_prix_saisie_libre ?? true)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!isValidFreeEntry(pendingFreeEntry.draft)}
                  onClick={() => {
                    if (!isValidFreeEntry(pendingFreeEntry.draft)) return;
                    recordAnswer(
                      pendingFreeEntry.instanceId,
                      FREE_ENTRY_MARKER,
                      buildFreeEntryReponses(pendingFreeEntry.instanceId, pendingFreeEntry.draft),
                    );
                    setPendingFreeEntry(null);
                  }}
                >
                  Valider
                </Button>
                <Button size="sm" variant="outline" className="bg-white" onClick={() => setPendingFreeEntry(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {!currentQuestion.obligatoire && (
            <div className="flex justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={skipCurrentQuestion}>
                Passer
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
                {reponses
                  .filter((r) => !r.question_id.startsWith('prix_') && !r.question_id.startsWith('fas_') && !r.question_id.startsWith('quantite_'))
                  .map((r) => {
                    const q = expandedQuestions.find((eq) => eq.instanceId === r.question_id);
                    const isRemiseQuestion = q?.question.affichage === 'remise_produits';
                    let valueDisplay: ReactNode = formatReponseText(r.valeur);

                    if (isRemiseQuestion && r.valeur === true) {
                      const prixReponse = reponses.find((rep) => rep.question_id === `prix_${r.question_id}`);
                      if (prixReponse && typeof prixReponse.valeur === 'string') {
                        try {
                          const priceMap = JSON.parse(prixReponse.valeur) as Record<string, string>;
                          const items: Array<{ nom: string; prix: string }> = [];
                          const seen = new Set<string>();
                          Object.entries(priceMap).forEach(([key, value]) => {
                            const product = catalogue.find((p) => p.id === key || p.nom === key);
                            const nom = product?.nom ?? key;
                            if (seen.has(nom)) return;
                            seen.add(nom);
                            items.push({ nom, prix: value });
                          });
                          if (items.length > 0) {
                            valueDisplay = (
                              <span className="font-medium">
                                {items.map((item, idx) => (
                                  <span key={item.nom}>
                                    {idx > 0 && ', '}
                                    {item.nom} ({Number(item.prix).toFixed(2).replace('.', ',')} €/mois)
                                  </span>
                                ))}
                              </span>
                            );
                          }
                        } catch {
                          // ignore JSON parse errors
                        }
                      }
                    }

                    return (
                      <li key={r.question_id} className="flex gap-2">
                        <span className="text-gray-500 shrink-0">
                          {q ? resolveTemplateText(q.displayLabel, donneesExtraites, reponses, q.iterationIndex) : r.question_id} :
                        </span>
                        {typeof valueDisplay === 'string' ? <span className="font-medium">{valueDisplay}</span> : valueDisplay}
                      </li>
                    );
                  })}
              </ul>
              {simulationExportStatus === 'preparing' && (
                <p className="text-sm text-amber-700">
                  Préparation des données d&apos;export SA / SP...
                </p>
              )}
              {simulationExportStatus === 'error' && simulationExportError && (
                <p className="text-sm text-red-600">
                  {simulationExportError}
                </p>
              )}
              {simulationExportStatus === 'ready' && simulationPropositionId && (
                <div className="pt-2">
                  <p className="text-sm text-green-700 mb-2">Exports SA / SP :</p>
                  <ExportSaSpButtons propositionId={simulationPropositionId} />
                </div>
              )}
            </div>
          ) : (
            <Button onClick={() => onComplete(reponses)} className="bg-green-600 hover:bg-green-700">
              <ChevronRight className="w-4 h-4 mr-2" />
              Générer la Situation Proposée
            </Button>
          )}
        </div>
      )}

      {/* Real-time carts : Situation Actuelle (au-dessus) + Situation Proposée (en-dessous) */}
      {(() => {
        const spSummary = calculateCartSummary(
          reponses,
          questions,
          catalogue,
          donneesExtraites,
          spConfigLoyer,
          spConfigMoisOfferts,
        );
        // Pour la comparaison, on aligne sur le loyer mensuel SP (qui inclut
        // matériel, FAS, cadeaux, indemnités, marge). Fallback : total abonnements.
        const spReference =
          spSummary.loyer?.loyer_mensuel && spSummary.loyer.loyer_mensuel > 0
            ? spSummary.loyer.loyer_mensuel
            : spSummary.abonnements.totalMensuel;
        return (
          <div
            ref={widgetContainerRef}
            className="fixed z-40 group"
            style={
              !widgetsVisibles
                ? { display: 'none' }
                : widgetPos
                ? { left: widgetPos.x, top: widgetPos.y }
                : { bottom: 16, right: 16 }
            }
          >
            {/* Discrete drag handle — top-right corner, appears on hover */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                if (!widgetContainerRef.current) return;
                const rect = widgetContainerRef.current.getBoundingClientRect();
                widgetDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                setWidgetPos({ x: rect.left, y: rect.top });
                isDraggingWidget.current = true;
              }}
              className="absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-black/20 hover:bg-black/40 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing select-none transition-all"
              title="Déplacer les widgets"
            >
              <GripHorizontal className="h-3.5 w-3.5 text-white" />
            </div>

            <div className="flex flex-col gap-3 items-end max-h-[calc(100vh-2rem)] overflow-y-auto">
              <SpMargeWidget
                reponses={reponses}
                questions={questions}
                catalogue={catalogue}
                donneesExtraites={donneesExtraites}
                spConfigLoyer={spConfigLoyer}
                spConfigMoisOfferts={spConfigMoisOfferts}
                onUpdateReponses={(nextReponses) => {
                  setReponses(nextReponses);
                }}
              />
              <SpIndemniteWidget
                reponses={reponses}
                questions={questions}
                donneesExtraites={donneesExtraites}
                spConfigResiliation={spConfigResiliation}
                onUpdateReponses={(nextReponses) => {
                  setReponses(nextReponses);
                }}
              />
              <SaRealTimeCart
                donneesExtraites={donneesExtraites}
                spTotalMensuel={spReference}
              />
              <SpRealTimeCart
                reponses={reponses}
                questions={questions}
                catalogue={catalogue}
                donneesExtraites={donneesExtraites}
                spConfigLoyer={spConfigLoyer}
                spConfigMoisOfferts={spConfigMoisOfferts}
              />
            </div>
          </div>
        );
      })()}

      {/* Boutons de contrôle mode client (visibles uniquement si toggle autorisé) */}
      {spConfigModeClient?.permettre_toggle_depuis_questionnaire && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 items-start">
          <button
            type="button"
            onClick={() => {
              const next = !modeClientActif;
              setModeClientActif(next);
              if (next && spConfigModeClient.masquer_widgets_par_defaut) setWidgetsVisibles(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm transition-colors ${
              modeClientActif
                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {modeClientActif
              ? <><EyeOff className="w-3 h-3" />Mode client ON</>
              : <><Eye className="w-3 h-3" />Mode client OFF</>
            }
          </button>
          <button
            type="button"
            onClick={() => setWidgetsVisibles((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm bg-white text-gray-600 border-gray-300 hover:border-gray-400 transition-colors"
          >
            {widgetsVisibles ? <><EyeOff className="w-3 h-3" />Cacher widgets</> : <><Eye className="w-3 h-3" />Afficher widgets</>}
          </button>
        </div>
      )}
    </div>
  );
}
