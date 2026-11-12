'use client';

import { scheduleSpSave, flushSpSaves, hasPendingSpSave } from '@/lib/propositions/sp-save-queue';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Gift,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  Wrench,
  X,
} from 'lucide-react';
import type {
  CatalogueCategorie,
  CatalogueProduit,
  SpAdresse,
  SpBandeauFlottantChamp,
  SpCategorie,
  SpConfigLoyer,
  SpConfigModeDirect,
  SpConfigMoisOfferts,
  SpConfigRemises,
  SpLibelleKey,
  SpLibellesConfig,
  SpObjectifConfig,
  SpPreferencesProduits,
  SpQuestion,
  SpQuestionReponse,
  SpRegleRemise,
  SpTableProductOrders,
  SuggestionsSpCompletes,
} from '@/types';
import {
  buildLoopLabelsByGroup,
  calculateCartSummary,
  DIRECT_REMISE_PRODUITS_QUESTION_ID,
  MANUAL_PRODUCT_PREFIX,
  type CartLine,
} from '@/lib/sp/calculateCart';
import { setCartReponseMapValue, updateCartLinePriceOrQuantity } from '@/lib/sp/cartLineEdits';
import { buildSpResumeBreakdown } from '@/lib/sp/spResumeBreakdown';
import {
  calculerMontantAnneeLissee,
  calculerMontantFinance,
  LOYER_MANUEL_QUESTION_ID,
} from '@/lib/sp/calculLoyer';
import { synchroniserMargeAuto } from '@/lib/sp/calculMargeAuto';
import {
  calculerPrixRemiseProduit,
  getEligibleDiscountProducts,
} from '@/lib/sp/evaluateDiscountRules';
import { DEFAULT_CHAMPS_BANDEAU_FLOTTANT } from '@/components/settings/SpModeDirectManager';
import { isLibelleVisible, resolveLibelle } from '@/lib/sp/libelles';
import { repairSpCompletesFromQuestionnaire } from '@/lib/sp/repairSpCompletes';
import { evaluateObjectifsForRender } from '@/lib/sp/evaluateObjectifs';
import SpObjectifsAccomplis from '@/components/sp/SpObjectifsAccomplis';
import {
  ClientCoordonneesFields,
  type ClientEdit,
} from '@/components/propositions/FloatingClientCoordonnees';
import {
  findAddressQuestion,
  spAddressToClient,
  syncLinkedAddresses,
} from '@/lib/sp/questionVariables';
import { maskPhoneInput, normalizePhoneNumber } from '@/lib/utils/formatting';

const TELECOM_CATEGORIES = new Set<CatalogueCategorie>(['fixe', 'mobile']);

function genUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseEuroValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatEuroValue(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatSpValue(value: SpQuestionReponse['valeur']): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([key, v]) => `${formatFieldName(key)} : ${String(v)}`)
      .join(' · ');
  }
  if (!value) return '-';
  const text = String(value);
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(', ');
      if (isRecord(parsed)) {
        return (
          Object.entries(parsed)
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '0' && v !== 0)
            .map(([key, v]) => `${key} : ${String(v)}`)
            .join(' · ') || '-'
        );
      }
    } catch {
      return text;
    }
  }
  return text;
}

function isTechnicalSpResponse(reponse: SpQuestionReponse, questionsById: Map<string, SpQuestion>): boolean {
  const id = reponse.question_id.toLowerCase();
  if (!questionsById.has(reponse.question_id)) return true;
  if (id.startsWith('fas_') || id.startsWith('prix_') || id.startsWith('quantite_') || id.startsWith('libre_')) return true;
  if (id.startsWith('sp_prix_override_') || id.includes('_prix_override_')) return true;
  return false;
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

function getStr(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function initClientEdit(
  donneesExtraites: Record<string, unknown>,
  adresseFactu?: SpAdresse,
): ClientEdit {
  const client = isRecord(donneesExtraites.client) ? donneesExtraites.client : {};
  return {
    raison_sociale: getStr(client, 'raison_sociale') || adresseFactu?.societe || '',
    nom: getStr(client, 'nom') || adresseFactu?.nom || adresseFactu?.contact || '',
    prenom: getStr(client, 'prenom') || adresseFactu?.prenom || '',
    fonction: getStr(client, 'fonction') || adresseFactu?.fonction || '',
    email: getStr(client, 'email') || adresseFactu?.email || '',
    mobile: getStr(client, 'mobile') || adresseFactu?.ligne_mobile || '',
    fixe: getStr(client, 'fixe') || adresseFactu?.ligne_fixe || '',
    adresse: getStr(client, 'adresse') || adresseFactu?.adresse || '',
    code_postal: getStr(client, 'code_postal') || adresseFactu?.code_postal || '',
    ville: getStr(client, 'ville') || adresseFactu?.ville || '',
    siret: getStr(client, 'siret') || getStr(client, 'siren') || adresseFactu?.siret || '',
  };
}

function clientEditToSpAddress(edit: ClientEdit, previous?: SpAdresse): SpAdresse {
  return {
    ...previous,
    societe: edit.raison_sociale,
    nom: edit.nom,
    prenom: edit.prenom,
    fonction: edit.fonction,
    contact: [edit.nom, edit.prenom].filter(Boolean).join(' '),
    email: edit.email,
    ligne_mobile: edit.mobile,
    ligne_fixe: edit.fixe,
    adresse: edit.adresse,
    code_postal: edit.code_postal,
    ville: edit.ville,
    siret: edit.siret,
  };
}

function spAddressToClientEdit(address?: SpAdresse | null): ClientEdit {
  return {
    raison_sociale: address?.societe ?? '',
    nom: address?.nom ?? address?.contact ?? '',
    prenom: address?.prenom ?? '',
    fonction: address?.fonction ?? '',
    email: address?.email ?? '',
    mobile: address?.ligne_mobile ?? '',
    fixe: address?.ligne_fixe ?? '',
    adresse: address?.adresse ?? '',
    code_postal: address?.code_postal ?? '',
    ville: address?.ville ?? '',
    siret: address?.siret ?? '',
  };
}

/**
 * Si d'anciennes propositions ont un `SuggestionsSpCompletes` mais pas encore de
 * `sp_reponses` (ou une version partielle), génère des réponses `manual_<uid>` à
 * partir des tableaux `sp_lignes_*`, `sp_materiel` et `sp_cadeaux_table` afin que
 * le panier temps réel puisse tout éditer sans perte.
 */
function buildFallbackReponsesFromSp(
  sp: SuggestionsSpCompletes | null,
  catalogue: CatalogueProduit[],
): SpQuestionReponse[] {
  if (!sp) return [];
  const out: SpQuestionReponse[] = [];
  const findCat = (id?: string, nom?: string) =>
    (id ? catalogue.find((c) => c.id === id) : undefined) ??
    (nom ? catalogue.find((c) => c.nom === nom) : undefined);

  const pushTelecom = (
    rows: Array<{
      sp_produit?: string;
      sp_produit_id?: string;
      sp_quantite?: string;
      sp_numero?: string;
      _prix_propose_raw?: number;
    }>,
    fallbackCat: CatalogueCategorie,
  ) => {
    rows.forEach((row, idx) => {
      const cat = findCat(row.sp_produit_id, row.sp_produit);
      const iid = `manual_init_${fallbackCat}_${idx}`;
      const qty = Math.max(1, Number(row.sp_quantite) || 1);
      const total = typeof row._prix_propose_raw === 'number' ? row._prix_propose_raw : 0;
      if (cat) {
        out.push({ question_id: iid, valeur: cat.id });
        out.push({ question_id: `quantite_${iid}`, valeur: JSON.stringify({ [cat.nom]: String(qty) }) });
        out.push({ question_id: `prix_${iid}`, valeur: JSON.stringify({ [cat.id]: String(total) }) });
        if (row.sp_numero?.trim()) {
          out.push({ question_id: `numero_${iid}`, valeur: JSON.stringify({ [cat.id]: row.sp_numero.trim() }) });
        }
      }
    });
  };

  pushTelecom(sp.sp_lignes_mobiles ?? [], 'mobile');
  pushTelecom(sp.sp_lignes_fixes ?? [], 'fixe');
  pushTelecom(sp.sp_internet ?? [], 'internet');

  (sp.sp_materiel ?? []).forEach((m, idx) => {
    const cat = findCat(m.sp_materiel_produit_id, m.sp_materiel_nom);
    const iid = `manual_init_mat_${idx}`;
    const qty = Math.max(1, Number(m.sp_materiel_quantite) || 1);
    if (cat) {
      out.push({ question_id: iid, valeur: cat.id });
      out.push({ question_id: `quantite_${iid}`, valeur: JSON.stringify({ [cat.nom]: String(qty) }) });
      out.push({ question_id: `prix_${iid}`, valeur: JSON.stringify({ [cat.id]: String(m._prix_mensuel_raw || 0) }) });
    }
  });

  (sp.sp_cadeaux_table ?? []).forEach((c, idx) => {
    const cat = findCat(undefined, c.sp_cadeau_nom);
    const iid = `manual_init_cad_${idx}`;
    const qty = Math.max(1, Number(c.sp_cadeau_quantite) || 1);
    if (cat) {
      out.push({ question_id: iid, valeur: cat.id });
      out.push({ question_id: `quantite_${iid}`, valeur: JSON.stringify({ [cat.nom]: String(qty) }) });
      out.push({ question_id: `prix_${iid}`, valeur: JSON.stringify({ [cat.id]: String(c._valeur_raw || 0) }) });
    }
  });

  if (sp.sp_marge) {
    const margeNum = parseEuroValue(sp.sp_marge);
    if (margeNum !== 0) {
      out.push({ question_id: 'sp_marge_calculee', valeur: String(margeNum) });
    }
  }
  if (sp.sp_total_indemnites) {
    const indemNum = parseEuroValue(sp.sp_total_indemnites);
    if (indemNum > 0) {
      out.push({ question_id: 'sp_total_indemnites', valeur: String(indemNum) });
    }
  }

  return out;
}

type FrameCategory = 'mobile' | 'fixe' | 'internet' | 'materiel' | 'cadeaux';

function matchesFrameCategory(product: CatalogueProduit, frame: FrameCategory): boolean {
  switch (frame) {
    case 'mobile':
      return product.categorie === 'mobile' && product.type_frequence === 'mensuel';
    case 'fixe':
      return product.categorie === 'fixe' && product.type_frequence === 'mensuel';
    case 'internet':
      return product.categorie === 'internet' && product.type_frequence === 'mensuel';
    case 'cadeaux':
      return product.categorie === 'cadeau';
    case 'materiel':
      return (
        product.categorie === 'equipement' ||
        product.categorie === 'installation' ||
        product.categorie === 'cloud' ||
        product.categorie === 'autre' ||
        (product.type_frequence === 'unique' && product.categorie !== 'cadeau')
      );
  }
}

interface ProductLineRowProps {
  line: CartLine;
  catalogueProduct?: CatalogueProduit;
  badgeColorClass: string;
  saNumeros: string[];
  usedNumeroDigits: Set<string>;
  onUpdate: (field: 'prix' | 'quantite' | 'fas', value: number) => void;
  onUpdateNumero?: (numero: string) => void;
  onDelete: () => void;
}

function ProductLineRow({
  line,
  catalogueProduct,
  badgeColorClass,
  saNumeros,
  usedNumeroDigits,
  onUpdate,
  onUpdateNumero,
  onDelete,
}: ProductLineRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const qty = line.quantite > 0 ? line.quantite : 1;
  const prixUnitaire = line.prixTotal / qty;
  const hasRemise = line.prixOriginalTotal != null && line.prixOriginalTotal > line.prixTotal + 0.005;
  const prixUnitaireOriginal = hasRemise && line.prixOriginalTotal != null ? line.prixOriginalTotal / qty : null;
  const isTelecom = TELECOM_CATEGORIES.has(line.categorie);
  const fournisseur = catalogueProduct?.fournisseur;
  const img = catalogueProduct?.image_url;
  const desc = catalogueProduct?.description;
  const numeroListId = `resume-sa-numeros-${line.instanceId}-${line.produitId ?? line.produitNom}`;
  const ownDigits = (line.numero ?? '').replace(/\D/g, '');
  const availableNumeros = saNumeros.filter((n) => {
    const d = n.replace(/\D/g, '');
    return d === ownDigits || !usedNumeroDigits.has(d);
  });

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {img && !isTelecom && line.categorie !== 'internet' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={line.produitNom}
              loading="lazy"
              className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-slate-900 truncate">{line.produitNom}</p>
              {line.numero && (
                <span
                  className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-medium"
                  title={`Numéro attribué : ${line.numero}`}
                >
                  {line.numero}
                </span>
              )}
            </div>
            {desc && !isTelecom && line.categorie !== 'internet' && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{desc}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {fournisseur && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColorClass}`}>
                  {fournisseur}
                </span>
              )}
              {!isTelecom && line.categorie !== 'internet' && line.categorie !== 'cadeau' && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    line.type_frequence === 'unique'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-purple-50 text-purple-700'
                  }`}
                >
                  {line.type_frequence === 'unique' ? 'Achat unique' : 'Mensuel'}
                </span>
              )}
              <span className="text-xs text-slate-500">Qté : {qty}</span>
              {hasRemise && prixUnitaireOriginal != null && (
                <span className="text-xs text-slate-400 line-through">
                  {formatEuroValue(prixUnitaireOriginal * qty)}
                </span>
              )}
              {line.fasTotal > 0 && (
                <span className="text-xs text-slate-400">
                  FAS : {formatEuroValue(line.fasTotal)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <p className="text-sm font-semibold text-slate-900 whitespace-nowrap tabular-nums">
            {formatEuroValue(line.prixTotal)}
          </p>
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            title={isEditing ? 'Fermer l’édition' : 'Modifier ce produit'}
            className={`rounded-md p-1.5 transition-colors ${
              isEditing
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Supprimer ce produit"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label className="text-slate-600 font-medium">
              Prix unitaire ({line.type_frequence === 'mensuel' ? '€/mois' : '€ HT'})
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={Math.round(prixUnitaire * 100) / 100}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0) onUpdate('prix', v * qty);
              }}
              className="w-24 rounded border border-blue-300 bg-white px-2 py-1 text-xs text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-slate-600 font-medium">Quantité</label>
            <input
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 1) onUpdate('quantite', Math.max(1, v));
              }}
              className="w-20 rounded border border-blue-300 bg-white px-2 py-1 text-xs text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-slate-600 font-medium">FAS total (€)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={Math.round(line.fasTotal * 100) / 100}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0) onUpdate('fas', v);
              }}
              className="w-24 rounded border border-blue-300 bg-white px-2 py-1 text-xs text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {isTelecom && onUpdateNumero && (
            <div className="flex items-center justify-between gap-2">
              <label className="text-slate-600 font-medium">Numéro</label>
              <input
                type="text"
                inputMode="tel"
                list={numeroListId}
                defaultValue={line.numero ?? ''}
                placeholder="06 12 34 56 78"
                maxLength={20}
                onChange={(e) => {
                  e.currentTarget.value = maskPhoneInput(e.currentTarget.value);
                }}
                onBlur={(e) => onUpdateNumero(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-32 rounded border border-blue-300 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
      )}
    </div>
  );
}

interface CategoryProductAdderProps {
  frameCategory: FrameCategory;
  frameLabel: string;
  catalogue: CatalogueProduit[];
  onAddProduct: (product: CatalogueProduit) => void;
}

function CategoryProductAdder({
  frameCategory,
  frameLabel,
  catalogue,
  onAddProduct,
}: CategoryProductAdderProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const eligibleProducts = useMemo(
    () =>
      catalogue
        .filter((p) => p.actif !== false && matchesFrameCategory(p, frameCategory))
        .filter((p) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return (
            p.nom.toLowerCase().includes(q) ||
            (p.fournisseur ?? '').toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q)
          );
        }),
    [catalogue, frameCategory, search],
  );

  if (!open) {
    return (
      <div className="px-4 py-2.5 bg-slate-50/50 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un produit ({frameLabel})
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-50/70 border-t border-slate-200 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher un produit ${frameLabel.toLowerCase()}…`}
            className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSearch('');
          }}
          title="Fermer"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {eligibleProducts.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-slate-400 italic">
            Aucun produit {frameLabel.toLowerCase()} trouvé dans le catalogue.
          </p>
        ) : (
          eligibleProducts.map((p) => {
            const unitPrice = p.type_frequence === 'mensuel' ? (p.prix_mensuel ?? 0) : (p.prix_vente ?? 0);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onAddProduct(p);
                  setSearch('');
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{p.nom}</p>
                  {p.fournisseur && (
                    <p className="text-[11px] text-slate-400 truncate">{p.fournisseur}</p>
                  )}
                </div>
                <span className="shrink-0 font-semibold text-slate-700 tabular-nums">
                  {formatEuroValue(unitPrice)}
                  {p.type_frequence === 'mensuel' && (
                    <span className="text-[10px] font-normal text-slate-400">/mois</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface EditableSpResumePanelProps {
  spVariantId?: string;
  propositionId: string;
  initialSp: SuggestionsSpCompletes | null;
  initialReponses: SpQuestionReponse[];
  questions: SpQuestion[];
  catalogue: CatalogueProduit[];
  initialDonneesExtraites: Record<string, unknown>;
  saTotalMensuel: number;
  spConfigLoyer?: SpConfigLoyer;
  spConfigMoisOfferts?: SpConfigMoisOfferts;
  spPreferencesProduits?: SpPreferencesProduits;
  spConfigRemises?: SpConfigRemises;
  discountRules?: SpRegleRemise[];
  spConfigModeDirect?: SpConfigModeDirect;
  spLibelles?: SpLibellesConfig;
  spCategoriesOrder?: SpCategorie[];
  spTableProductOrders?: SpTableProductOrders;
  spObjectifsConfig?: SpObjectifConfig[];
  templateId?: string;
}

export function EditableSpResumePanel({
  propositionId,
  spVariantId,
  initialSp,
  initialReponses,
  questions,
  catalogue,
  initialDonneesExtraites,
  saTotalMensuel,
  spConfigLoyer,
  spConfigMoisOfferts,
  spPreferencesProduits,
  spConfigRemises,
  discountRules = [],
  spConfigModeDirect,
  spLibelles,
  spCategoriesOrder,
  spTableProductOrders,
  spObjectifsConfig = [],
  templateId = '',
}: EditableSpResumePanelProps) {
  const [reponses, setReponses] = useState<SpQuestionReponse[]>(() =>
    initialReponses.length > 0 ? initialReponses : buildFallbackReponsesFromSp(initialSp, catalogue),
  );
  const [donneesExtraites, setDonneesExtraites] = useState<Record<string, unknown>>(initialDonneesExtraites);
  const [fournisseurPropose, setFournisseurPropose] = useState<string>(
    initialSp?.sp_fournisseur_propose ?? '',
  );
  const [clientEdit, setClientEdit] = useState<ClientEdit>(() =>
    initClientEdit(initialDonneesExtraites, initialSp?.sp_adresse_facturation),
  );
  const [livraisonIdentique, setLivraisonIdentique] = useState<boolean>(
    initialSp?.sp_livraison_identique ?? true,
  );
  const [adresseLivraisonEdit, setAdresseLivraisonEdit] = useState<ClientEdit>(() =>
    spAddressToClientEdit(initialSp?.sp_adresse_livraison),
  );
  const [editingClientSection, setEditingClientSection] = useState(false);
  const [editingLoyer, setEditingLoyer] = useState(false);
  const [loyerDraft, setLoyerDraft] = useState('');
  const [editingMargeHero, setEditingMargeHero] = useState(false);
  const [margeDraft, setMargeDraft] = useState('');
  const [editingDiscountProductId, setEditingDiscountProductId] = useState<string | null>(null);
  const [discountOverrides, setDiscountOverrides] = useState<Record<string, string>>({});
  const [isHeroStickyVisible, setIsHeroStickyVisible] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState({ left: 0, width: 0 });
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const lbl = useCallback(
    (key: SpLibelleKey) => resolveLibelle(spLibelles, key),
    [spLibelles],
  );
  const visible = useCallback(
    (key: SpLibelleKey) => isLibelleVisible(spLibelles, key),
    [spLibelles],
  );

  const catalogueMap = useMemo(() => {
    const map = new Map<string, CatalogueProduit>();
    for (const p of catalogue) map.set(p.id, p);
    return map;
  }, [catalogue]);
  const resolveCatalogueProduct = (line: CartLine): CatalogueProduit | undefined =>
    (line.produitId ? catalogueMap.get(line.produitId) : undefined) ??
    catalogue.find((product) => product.nom === line.produitNom && product.categorie === line.categorie);

  const questionsById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );

  const questionMargeIds = useMemo(
    () => questions.filter((q) => q.affichage === 'marge').map((q) => q.id),
    [questions],
  );

  const remiseQuestion = useMemo(
    () => questions.find((q) => q.affichage === 'remise_produits'),
    [questions],
  );

  const effectiveDiscountRules = useMemo(
    () => spConfigRemises?.regles ?? discountRules,
    [spConfigRemises, discountRules],
  );

  const eligibleDiscountProducts = useMemo(
    () =>
      getEligibleDiscountProducts({
        rules: effectiveDiscountRules,
        products: catalogue,
        reponses,
        donneesExtraites,
        spPreferencesProduits,
        spConfigRemises,
      }),
    [effectiveDiscountRules, catalogue, reponses, donneesExtraites, spPreferencesProduits, spConfigRemises],
  );

  const modeRemisesOperateur = spConfigModeDirect?.mode_remises_operateur ?? 'manuel';

  // Détecte les remises actuellement appliquées dans `sp_reponses`
  const appliedDiscountsMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const rep of reponses) {
      const isDirect = rep.question_id === DIRECT_REMISE_PRODUITS_QUESTION_ID;
      const isQuestionRemise =
        remiseQuestion &&
        (rep.question_id === `prix_${remiseQuestion.id}` ||
          rep.question_id.startsWith(`prix_${remiseQuestion.id}__iter_`));
      if (!isDirect && !isQuestionRemise) continue;
      const map = parseJsonMap(rep.valeur);
      if (!map) continue;
      for (const [k, v] of Object.entries(map)) {
        const num = Number(v);
        if (Number.isFinite(num)) out[k] = num;
      }
    }
    return out;
  }, [reponses, remiseQuestion]);

  const hasAppliedDiscounts = Object.keys(appliedDiscountsMap).length > 0;

  // Recalcul dynamique temps réel du panier SP
  const cart = useMemo(
    () =>
      calculateCartSummary(
        reponses,
        questions,
        catalogue,
        donneesExtraites,
        spConfigLoyer,
        spConfigMoisOfferts,
        spPreferencesProduits,
      ),
    [reponses, questions, catalogue, donneesExtraites, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits],
  );

  // Reconstruction complète de SuggestionsSpCompletes en temps réel
  const currentSp = useMemo(() => {
    const adresseFacturation = clientEditToSpAddress(clientEdit, initialSp?.sp_adresse_facturation);
    const adresseLivraison = livraisonIdentique
      ? undefined
      : clientEditToSpAddress(adresseLivraisonEdit, initialSp?.sp_adresse_livraison ?? undefined);

    return repairSpCompletesFromQuestionnaire(
      initialSp,
      reponses,
      questions,
      catalogue,
      donneesExtraites,
      spConfigLoyer,
      spConfigMoisOfferts,
      spPreferencesProduits,
      spCategoriesOrder,
      spTableProductOrders,
      {
        allowEmptyCart: true,
        clientOverrides: {
          sp_fournisseur_propose: fournisseurPropose.trim() || undefined,
          sp_adresse_facturation: adresseFacturation,
          sp_adresse_livraison: adresseLivraison,
          sp_livraison_identique: livraisonIdentique,
        },
      },
    );
  }, [
    initialSp,
    reponses,
    questions,
    catalogue,
    donneesExtraites,
    spConfigLoyer,
    spConfigMoisOfferts,
    spPreferencesProduits,
    spCategoriesOrder,
    spTableProductOrders,
    clientEdit,
    livraisonIdentique,
    adresseLivraisonEdit,
    fournisseurPropose,
  ]);

  // Auto-sauvegarde debouncée (500 ms)
  const savedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSave = useCallback(
    (
      nextReponses: SpQuestionReponse[],
      nextDonnees: Record<string, unknown>,
      nextClientEdit: ClientEdit,
      nextFournisseur: string,
      nextLivraisonIdentique: boolean,
      nextLivraisonEdit: ClientEdit,
    ) => {
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
      setSaveStatus('saving');

      scheduleSpSave(async () => {
        try {
          const adresseFacturation = clientEditToSpAddress(nextClientEdit, initialSp?.sp_adresse_facturation);
          const adresseLivraison = nextLivraisonIdentique
            ? undefined
            : clientEditToSpAddress(nextLivraisonEdit, initialSp?.sp_adresse_livraison ?? undefined);

          const repairedSp = repairSpCompletesFromQuestionnaire(
            initialSp,
            nextReponses,
            questions,
            catalogue,
            nextDonnees,
            spConfigLoyer,
            spConfigMoisOfferts,
            spPreferencesProduits,
            spCategoriesOrder,
            spTableProductOrders,
            {
              allowEmptyCart: true,
              clientOverrides: {
                sp_fournisseur_propose: nextFournisseur.trim() || undefined,
                sp_adresse_facturation: adresseFacturation,
                sp_adresse_livraison: adresseLivraison,
                sp_livraison_identique: nextLivraisonIdentique,
              },
            },
          );

          const payload: Record<string, unknown> = {
            sp_reponses: nextReponses,
            suggestions_sp_completes: repairedSp,
            filled_data: nextDonnees,
          };
          if (nextClientEdit.raison_sociale.trim()) {
            payload.nom_client = nextClientEdit.raison_sociale.trim();
          }

          const res = await fetch(`/api/propositions/${propositionId}/update${spVariantId ? `?variant=${encodeURIComponent(spVariantId)}` : ''}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('Erreur sauvegarde');
          setSaveStatus('saved');
          savedResetTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
        } catch (err) {
          console.error('Erreur auto-sauvegarde Résumé SP:', err);
          setSaveStatus('error');
          throw err;
        }
      });
    },
    [
      propositionId,
      spVariantId,
      initialSp,
      questions,
      catalogue,
      spConfigLoyer,
      spConfigMoisOfferts,
      spPreferencesProduits,
      spCategoriesOrder,
      spTableProductOrders,
    ],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasPendingSpSave()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      void flushSpSaves().catch(() => {});
      if (savedResetTimerRef.current) clearTimeout(savedResetTimerRef.current);
    };
  }, []);

  const applyReponsesUpdate = useCallback(
    (rawReponses: SpQuestionReponse[]) => {
      let nextReponses = rawReponses;

      if (modeRemisesOperateur === 'automatique') {
        const eligibles = getEligibleDiscountProducts({
          rules: effectiveDiscountRules,
          products: catalogue,
          reponses: nextReponses,
          donneesExtraites,
          spPreferencesProduits,
          spConfigRemises,
        });
        const priceMap: Record<string, string> = {};
        for (const p of eligibles) {
          const computed = calculerPrixRemiseProduit(p);
          if (computed != null && Number.isFinite(computed)) {
            priceMap[p.id] = String(computed);
            priceMap[p.nom] = String(computed);
          }
        }
        nextReponses = nextReponses.filter(
          (r) =>
            r.question_id !== DIRECT_REMISE_PRODUITS_QUESTION_ID &&
            (!remiseQuestion ||
              (r.question_id !== remiseQuestion.id &&
                r.question_id !== `prix_${remiseQuestion.id}`)),
        );
        if (Object.keys(priceMap).length > 0) {
          const mapStr = JSON.stringify(priceMap);
          nextReponses.push({ question_id: DIRECT_REMISE_PRODUITS_QUESTION_ID, valeur: mapStr });
          if (remiseQuestion) {
            nextReponses.push({ question_id: remiseQuestion.id, valeur: true });
            nextReponses.push({ question_id: `prix_${remiseQuestion.id}`, valeur: mapStr });
          }
        }
      }

      if (spConfigLoyer?.widget_marge?.mode === 'automatique') {
        const nextCart = calculateCartSummary(
          nextReponses,
          questions,
          catalogue,
          donneesExtraites,
          spConfigLoyer,
          spConfigMoisOfferts,
          spPreferencesProduits,
        );
        nextReponses = synchroniserMargeAuto(nextReponses, nextCart, questionMargeIds);
      }
      setReponses(nextReponses);
      scheduleAutoSave(
        nextReponses,
        donneesExtraites,
        clientEdit,
        fournisseurPropose,
        livraisonIdentique,
        adresseLivraisonEdit,
      );
    },
    [
      scheduleAutoSave,
      donneesExtraites,
      clientEdit,
      fournisseurPropose,
      livraisonIdentique,
      adresseLivraisonEdit,
      spConfigLoyer,
      questions,
      catalogue,
      spConfigMoisOfferts,
      spPreferencesProduits,
      questionMargeIds,
      modeRemisesOperateur,
      effectiveDiscountRules,
      spConfigRemises,
      remiseQuestion,
    ],
  );

  // En mode remises automatique, synchronise aussi à l'initialisation si des produits éligibles n'ont pas encore leur remise
  useEffect(() => {
    if (modeRemisesOperateur !== 'automatique') return;
    if (eligibleDiscountProducts.length === 0) return;
    const expectedMap: Record<string, string> = {};
    for (const p of eligibleDiscountProducts) {
      const computed = calculerPrixRemiseProduit(p);
      if (computed != null && Number.isFinite(computed)) {
        expectedMap[p.id] = String(computed);
        expectedMap[p.nom] = String(computed);
      }
    }
    if (Object.keys(expectedMap).length === 0) return;
    const existingRep = reponses.find((r) => r.question_id === DIRECT_REMISE_PRODUITS_QUESTION_ID);
    const mapStr = JSON.stringify(expectedMap);
    if (existingRep?.valeur === mapStr) return;
    applyReponsesUpdate(reponses);
  }, [modeRemisesOperateur, eligibleDiscountProducts, reponses, applyReponsesUpdate]);

  const handleApplyManualDiscounts = () => {
    const priceMap: Record<string, string> = {};
    for (const p of eligibleDiscountProducts) {
      const computed = calculerPrixRemiseProduit(p);
      const overrideRaw = discountOverrides[p.id];
      const effectivePrix =
        overrideRaw !== undefined && overrideRaw.trim() !== ''
          ? Number(overrideRaw.replace(',', '.'))
          : (appliedDiscountsMap[p.id] ?? appliedDiscountsMap[p.nom] ?? computed);
      if (effectivePrix != null && Number.isFinite(effectivePrix) && effectivePrix >= 0) {
        priceMap[p.id] = String(effectivePrix);
        priceMap[p.nom] = String(effectivePrix);
      }
    }
    const filtered = reponses.filter(
      (r) =>
        r.question_id !== DIRECT_REMISE_PRODUITS_QUESTION_ID &&
        (!remiseQuestion ||
          (r.question_id !== remiseQuestion.id &&
            r.question_id !== `prix_${remiseQuestion.id}`)),
    );
    if (Object.keys(priceMap).length === 0) {
      applyReponsesUpdate(filtered);
      return;
    }
    const mapStr = JSON.stringify(priceMap);
    const next: SpQuestionReponse[] = [
      ...filtered,
      { question_id: DIRECT_REMISE_PRODUITS_QUESTION_ID, valeur: mapStr },
    ];
    if (remiseQuestion) {
      next.push({ question_id: remiseQuestion.id, valeur: true });
      next.push({ question_id: `prix_${remiseQuestion.id}`, valeur: mapStr });
    }
    applyReponsesUpdate(next);
  };

  const handleRemoveDiscounts = () => {
    const filtered = reponses.filter(
      (r) =>
        r.question_id !== DIRECT_REMISE_PRODUITS_QUESTION_ID &&
        (!remiseQuestion ||
          (r.question_id !== remiseQuestion.id &&
            r.question_id !== `prix_${remiseQuestion.id}`)),
    );
    applyReponsesUpdate(filtered);
  };

  // Le bandeau est fixe : son apparition ne doit pas déplacer le hero ni le seuil de déclenchement.
  useEffect(() => {
    const el = heroCardRef.current;
    if (!el || typeof window === 'undefined') return;

    const updateVisibility = () => {
      const rect = el.getBoundingClientRect();
      const header = document.querySelector('[data-proposition-detail-header]');
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const panelBottom = panelRef.current?.getBoundingClientRect().bottom ?? 0;
      // Apparaît une fois le hero entièrement sorti de l'écran (au-dessus du header).
      setIsHeroStickyVisible(rect.bottom < headerBottom - 40 && panelBottom > headerBottom + 80);
    };
    const updatePosition = () => {
      const rect = el.getBoundingClientRect();
      setFloatingPosition({
        left: rect.left,
        width: rect.width,
      });
      updateVisibility();
    };

    updatePosition();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updatePosition);
    };
  }, []);

  // Numéros SA disponibles pour l'autocomplétion
  const saNumeros = useMemo(() => {
    const fromSa = getSaNumeros(donneesExtraites);
    const reponsesWithoutEdits = reponses.filter((r) => !r.question_id.startsWith('loop_label__'));
    const originalLabels = buildLoopLabelsByGroup(questions, reponsesWithoutEdits, donneesExtraites);
    const finalLabels = buildLoopLabelsByGroup(questions, reponses, donneesExtraites);
    const out = new Set<string>(fromSa);
    for (const labels of originalLabels.values()) {
      for (const label of labels) {
        if (label.trim()) out.delete(label.trim());
      }
    }
    for (const labels of finalLabels.values()) {
      for (const label of labels) {
        if (label.trim()) out.add(label.trim());
      }
    }
    return [...out].map(normalizePhoneNumber);
  }, [donneesExtraites, questions, reponses]);

  const usedNumeroDigits = useMemo(() => {
    const s = new Set<string>();
    for (const l of cart.lines) {
      const d = (l.numero ?? '').replace(/\D/g, '');
      if (d) s.add(d);
    }
    return s;
  }, [cart.lines]);

  // Groupement des lignes du panier par cadre
  const grouped = useMemo(() => {
    const mobile: CartLine[] = [];
    const fixe: CartLine[] = [];
    const internet: CartLine[] = [];
    const materiel: CartLine[] = [];
    const cadeaux: CartLine[] = [];
    const fas: CartLine[] = [];

    for (const line of cart.lines) {
      if (line.fasTotal > 0) fas.push(line);
      if (line.type_frequence === 'mensuel' && line.categorie === 'mobile') {
        mobile.push(line);
      } else if (line.type_frequence === 'mensuel' && line.categorie === 'fixe') {
        fixe.push(line);
      } else if (line.type_frequence === 'mensuel' && line.categorie === 'internet') {
        internet.push(line);
      } else if (line.categorie === 'cadeau') {
        cadeaux.push(line);
      } else {
        materiel.push(line);
      }
    }

    return { mobile, fixe, internet, materiel, cadeaux, fas };
  }, [cart.lines]);

  // Handlers d'édition des lignes du panier (même logique que SpRealTimeCart)
  const handleUpdateLine = (
    line: CartLine,
    field: 'prix' | 'quantite' | 'fas',
    value: number,
  ) => {
    const updated =
      field === 'fas'
        ? setCartReponseMapValue(reponses, `fas_${line.instanceId}`, line.produitNom, value)
        : updateCartLinePriceOrQuantity(reponses, line, field, value);
    applyReponsesUpdate(updated);
  };

  const handleUpdateNumero = (line: CartLine, numero: string) => {
    const updated = setReponseMapStringValue(
      reponses,
      `numero_${line.instanceId}`,
      line.produitId ?? line.produitNom,
      normalizePhoneNumber(numero),
    );
    applyReponsesUpdate(updated);
  };

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

    if (iid.startsWith('auto_')) {
      applyReponsesUpdate(excludeAutoLine(iid));
      return;
    }

    const auxIds = new Set([
      `quantite_${iid}`,
      `prix_${iid}`,
      `prix_panier_${iid}`,
      `fas_${iid}`,
      `numero_${iid}`,
      `libre_${iid}`,
      `options_${iid}`,
      `quantite_options_${iid}`,
    ]);

    let next = [...reponses];
    const rep = next.find((r) => r.question_id === iid);

    if (iid.startsWith(MANUAL_PRODUCT_PREFIX)) {
      next = next.filter((r) => r.question_id !== iid && !auxIds.has(r.question_id));
      applyReponsesUpdate(next);
      return;
    }

    if (iid.startsWith('options_')) {
      if (rep) {
        const arr = Array.isArray(rep.valeur)
          ? rep.valeur.map(String)
          : typeof rep.valeur === 'string'
            ? (() => {
                try {
                  const p = JSON.parse(rep.valeur as string);
                  return Array.isArray(p) ? p.map(String) : [String(rep.valeur)];
                } catch {
                  return [String(rep.valeur)];
                }
              })()
            : [];
        const filtered = arr.filter((v) => v !== line.produitId && v !== line.produitNom);
        if (filtered.length === 0) {
          next = next.filter((r) => r.question_id !== iid);
        } else {
          next = next.map((r) => (r.question_id === iid ? { ...r, valeur: JSON.stringify(filtered) } : r));
        }
        next = next.flatMap((r) => {
          if (![`quantite_${iid}`, `prix_${iid}`, `prix_panier_${iid}`, `fas_${iid}`, `numero_${iid}`].includes(r.question_id)) return [r];
          const values = parseJsonMap(r.valeur);
          if (!values) return filtered.length ? [r] : [];
          delete values[line.produitId ?? ''];
          delete values[line.produitNom];
          return Object.keys(values).length ? [{ ...r, valeur: JSON.stringify(values) }] : [];
        });
      }
      applyReponsesUpdate(next);
      return;
    }

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

    if (rep && Array.isArray(rep.valeur)) {
      const filtered = rep.valeur.map(String).filter((v) => v !== removeToken);
      if (filtered.length === 0) {
        next = next.filter((r) => r.question_id !== iid && !auxIds.has(r.question_id));
      } else {
        next = next.map((r) => (r.question_id === iid ? { ...r, valeur: filtered } : r));
        if (isLibreLine) next = next.filter((r) => r.question_id !== `libre_${iid}`);
      }
    } else {
      next = next.filter((r) => r.question_id !== iid && !auxIds.has(r.question_id));
    }
    applyReponsesUpdate(next);
  };

  const handleAddProduct = (produit: CatalogueProduit) => {
    const uid = genUid();
    const iid = `${MANUAL_PRODUCT_PREFIX}${uid}`;
    const next: SpQuestionReponse[] = [
      ...reponses,
      { question_id: iid, valeur: produit.id },
    ];
    if (produit.prix_installation && produit.prix_installation > 0) {
      next.push({
        question_id: `fas_${iid}`,
        valeur: JSON.stringify({ [produit.nom]: String(produit.prix_installation) }),
      });
    }
    applyReponsesUpdate(next);
  };

  // Édition de l'indemnité de résiliation
  const indemQuestion = useMemo(
    () =>
      questions.find(
        (q) =>
          q.affichage === 'nombre' &&
          q.nombre_config?.suggestion_source === 'indemnite_resiliation',
      ) ??
      questions.find((q) =>
        q.consequences?.some(
          (c) => c.type === 'renseigner_variable' && c.variable_cible === 'sp_total_indemnites',
        ),
      ),
    [questions],
  );

  const handleUpdateIndemnites = (amount: number) => {
    const valStr = String(Math.max(0, amount));
    const targetIds = new Set<string>(['sp_total_indemnites']);
    if (indemQuestion) targetIds.add(indemQuestion.id);

    const filtered = reponses.filter(
      (r) =>
        !targetIds.has(r.question_id) &&
        !(indemQuestion && r.question_id.startsWith(`${indemQuestion.id}__iter_`)),
    );
    const next: SpQuestionReponse[] = [
      ...filtered,
      { question_id: 'sp_total_indemnites', valeur: valStr },
    ];
    if (indemQuestion) {
      next.push({ question_id: indemQuestion.id, valeur: valStr });
    }
    applyReponsesUpdate(next);
  };

  // Édition de la marge ou du loyer manuel
  const autoMargeMode = spConfigLoyer?.widget_marge?.mode === 'automatique';
  const loyerModifiable = autoMargeMode && !!spConfigLoyer?.widget_marge?.loyer_modifiable;

  const handleUpdateMarge = (amount: number) => {
    const valStr = String(amount);
    const filtered = reponses.filter((r) => r.question_id !== 'sp_marge_calculee');
    applyReponsesUpdate([...filtered, { question_id: 'sp_marge_calculee', valeur: valStr }]);
  };

  const handleUpdateLoyerManuel = (amount: number | null) => {
    const filtered = reponses.filter((r) => r.question_id !== LOYER_MANUEL_QUESTION_ID);
    if (amount == null) {
      applyReponsesUpdate(filtered);
    } else {
      applyReponsesUpdate([
        ...filtered,
        { question_id: LOYER_MANUEL_QUESTION_ID, valeur: String(Math.max(0, amount)) },
      ]);
    }
  };

  // Édition des coordonnées client & adresses
  const handleClientFieldChange = (key: keyof ClientEdit, value: string) => {
    const nextClientEdit: ClientEdit = { ...clientEdit, [key]: value };
    setClientEdit(nextClientEdit);

    const address = clientEditToSpAddress(nextClientEdit, initialSp?.sp_adresse_facturation);
    const nextDonnees = spAddressToClient(donneesExtraites, address);
    setDonneesExtraites(nextDonnees);

    const nextClientRecord = isRecord(nextDonnees.client) ? nextDonnees.client : {};
    let nextReponses = syncLinkedAddresses(questions, reponses, nextClientRecord);
    const billingQ = findAddressQuestion(questions, 'sp_adresse_facturation');
    if (billingQ && !nextReponses.some((r) => r.question_id === billingQ.id)) {
      nextReponses = [...nextReponses, { question_id: billingQ.id, valeur: address }];
    }
    setReponses(nextReponses);

    scheduleAutoSave(
      nextReponses,
      nextDonnees,
      nextClientEdit,
      fournisseurPropose,
      livraisonIdentique,
      adresseLivraisonEdit,
    );
  };

  const handleFournisseurChange = (value: string) => {
    setFournisseurPropose(value);
    scheduleAutoSave(
      reponses,
      donneesExtraites,
      clientEdit,
      value,
      livraisonIdentique,
      adresseLivraisonEdit,
    );
  };

  const handleLivraisonIdentiqueChange = (checked: boolean) => {
    setLivraisonIdentique(checked);
    let nextLivraison = adresseLivraisonEdit;
    if (!checked && !adresseLivraisonEdit.adresse && !adresseLivraisonEdit.ville) {
      nextLivraison = { ...clientEdit };
      setAdresseLivraisonEdit(nextLivraison);
    }
    const identQ = findAddressQuestion(questions, 'sp_livraison_identique');
    let nextReponses = reponses;
    if (identQ) {
      nextReponses = [
        ...reponses.filter((r) => r.question_id !== identQ.id),
        { question_id: identQ.id, valeur: checked },
      ];
      setReponses(nextReponses);
    }
    scheduleAutoSave(
      nextReponses,
      donneesExtraites,
      clientEdit,
      fournisseurPropose,
      checked,
      nextLivraison,
    );
  };

  const handleLivraisonFieldChange = (key: keyof ClientEdit, value: string) => {
    const nextLivraison: ClientEdit = { ...adresseLivraisonEdit, [key]: value };
    setAdresseLivraisonEdit(nextLivraison);

    const deliveryQ = findAddressQuestion(questions, 'sp_adresse_livraison');
    let nextReponses = reponses;
    if (deliveryQ) {
      const addr = clientEditToSpAddress(nextLivraison, initialSp?.sp_adresse_livraison ?? undefined);
      nextReponses = [
        ...reponses.filter((r) => r.question_id !== deliveryQ.id),
        { question_id: deliveryQ.id, valeur: addr },
      ];
      setReponses(nextReponses);
    }

    scheduleAutoSave(
      nextReponses,
      donneesExtraites,
      clientEdit,
      fournisseurPropose,
      livraisonIdentique,
      nextLivraison,
    );
  };

  // Totaux du bandeau supérieur (Photo 2 — Lecture seule, recalcul dynamique)
  const abosFixe = cart.abonnements.fixe;
  const abosMobile = cart.abonnements.mobile;
  const abosInternet = cart.abonnements.internet;
  const abosTotal = cart.abonnements.totalMensuel;
  const loyerMensuel = cart.loyer?.loyer_mensuel ?? null;
  const materielTotalFinal = cart.materiel;
  const installationsTotal = cart.installations;
  const fasTotalFinal = cart.fas;
  const cadeauxTotalFinal = cart.cadeaux;
  const indemnitesTotalFinal = cart.indemnites;
  const remiseMoisOffertFinal = cart.remiseMoisOffert;
  const totalPonctuelFinal = cart.totalPonctuel;
  const totalMensuelFinal = cart.totalMensuelFinal;

  const breakdown = useMemo(
    () =>
      buildSpResumeBreakdown(
        {
          total_mensuel: abosTotal,
          fixe: abosFixe,
          mobile: abosMobile,
          internet: abosInternet,
          autres_mensuels: cart.autresMensuels,
          materiel: materielTotalFinal,
          installations: installationsTotal,
          fas: fasTotalFinal,
          cadeaux: cadeauxTotalFinal,
          autres_ponctuels: cart.autresPonctuels,
          total_ponctuel: totalPonctuelFinal > 0 ? totalPonctuelFinal : undefined,
          loyer_total_ponctuel: loyerMensuel != null ? totalPonctuelFinal : undefined,
          remise_mois_offert:
            spConfigLoyer?.mois_offerts_actifs !== false &&
            spConfigLoyer?.composantes_base?.mois_offerts !== false
              ? remiseMoisOffertFinal
              : undefined,
          indemnites: indemnitesTotalFinal,
          marge:
            cart.marge !== 0 || spConfigLoyer?.widget_marge?.mode === 'automatique'
              ? cart.marge
              : undefined,
          montant_annee_lissee:
            loyerMensuel != null
              ? calculerMontantAnneeLissee(abosTotal, spConfigLoyer?.multiplicateur_annee_lissee)
              : undefined,
          base_loyer: cart.loyer ? cart.baseLoyer : undefined,
          loyer_trimestriel: cart.loyer?.loyer_trimestriel,
          montant_finance: calculerMontantFinance(cart.loyer, spConfigLoyer?.formule) ?? undefined,
        },
        loyerMensuel,
        spConfigLoyer?.mode_total_mensuel,
        spLibelles,
      ),
    [
      abosTotal,
      abosFixe,
      abosMobile,
      abosInternet,
      cart.autresMensuels,
      materielTotalFinal,
      installationsTotal,
      fasTotalFinal,
      cadeauxTotalFinal,
      cart.autresPonctuels,
      totalPonctuelFinal,
      loyerMensuel,
      spConfigLoyer,
      remiseMoisOffertFinal,
      indemnitesTotalFinal,
      cart.marge,
      cart.loyer,
      cart.baseLoyer,
      spLibelles,
    ],
  );

  const firstLoyerRow = breakdown.find((row) => row.section === 'loyer')?.key;
  const economieMensuelle = saTotalMensuel > 0 ? saTotalMensuel - totalMensuelFinal : null;

  const floatingRows = useMemo(() => {
    const allowedChamps = new Set<SpBandeauFlottantChamp>(
      spConfigModeDirect?.champs_bandeau_flottant ?? DEFAULT_CHAMPS_BANDEAU_FLOTTANT,
    );
    return breakdown.filter(
      (row) => !row.detail && allowedChamps.has(row.key as SpBandeauFlottantChamp),
    );
  }, [breakdown, spConfigModeDirect]);

  const questionResponses = useMemo(
    () =>
      spConfigModeDirect?.actif
        ? []
        : reponses.filter((reponse) => !isTechnicalSpResponse(reponse, questionsById)),
    [reponses, questionsById, spConfigModeDirect?.actif],
  );

  const resolvedObjectifs = useMemo(() => {
    if (!spObjectifsConfig.length || !templateId) return [];
    return evaluateObjectifsForRender(spObjectifsConfig, templateId, reponses, currentSp, catalogue);
  }, [spObjectifsConfig, templateId, reponses, currentSp, catalogue]);

  return (
    <div ref={panelRef} className="space-y-5">
      {/* ── Bandeau flottant compacté au scroll (Sticky Header) ── */}
      {isHeroStickyVisible && (
        <div
          className="fixed z-20 rounded-xl border border-slate-300 bg-white/95 backdrop-blur-md shadow-lg px-4 py-3"
          style={{ ...floatingPosition, bottom: 12 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Gauche : Total mensuel proposé + Économie/Surcoût */}
            <div className="flex items-center gap-3 shrink-0">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Total mensuel proposé
                </p>
                <p className="text-xl font-extrabold text-slate-900 leading-tight tabular-nums">
                  {formatEuroValue(totalMensuelFinal)}
                </p>
              </div>
              {economieMensuelle !== null && Math.abs(economieMensuelle) >= 0.01 && (
                <div
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${
                    economieMensuelle > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <TrendingDown
                    className={`w-3.5 h-3.5 ${
                      economieMensuelle > 0 ? 'text-emerald-600' : 'text-red-600 rotate-180'
                    }`}
                  />
                  <span>
                    {economieMensuelle > 0 ? 'Économie' : 'Surcoût'}{' '}
                    {formatEuroValue(Math.abs(economieMensuelle))}/mois
                  </span>
                </div>
              )}
            </div>

            {/* Droite : Champs sélectionnés en mode compacté */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {floatingRows.map((row) => (
                <div key={row.key} className="flex flex-col">
                  <span className="text-[10px] font-medium text-slate-400 truncate max-w-[140px]">
                    {row.label}
                  </span>
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      row.key === 'marge' && row.value > 0
                        ? 'text-emerald-700'
                        : row.key === 'marge' && row.value < 0
                          ? 'text-red-600'
                          : 'text-slate-900'
                    }`}
                  >
                    {formatEuroValue(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Indicateur d'auto-sauvegarde */}
      {saveStatus !== 'idle' && (
        <div className="flex items-center justify-end text-xs">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Enregistrement automatique…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" />
              Modifications enregistrées
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-600 font-medium">
              Erreur lors de l’enregistrement automatique
            </span>
          )}
        </div>
      )}

      {/* ── Hero section (Photo 2 — Lecture seule, recalcul dynamique) ── */}
      <div ref={heroCardRef} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Gauche — montant principal */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Total mensuel proposé
            </p>
            <p className="text-5xl font-extrabold text-slate-900 leading-none tabular-nums">
              {formatEuroValue(totalMensuelFinal)}
            </p>

            {/* Durée engagement */}
            {cart.loyer && (
              <p className="text-sm text-slate-500 mt-3">
                Engagement <strong className="text-slate-700">{cart.loyer.duree_mois} mois</strong>
                {cart.loyer.mois_offerts ? ` · ${cart.loyer.mois_offerts} mois offerts` : ''}
                {cart.loyer.trimestres ? ` (${cart.loyer.trimestres} trimestres)` : ''}
              </p>
            )}

            {/* Badge économie */}
            {economieMensuelle !== null && Math.abs(economieMensuelle) >= 0.01 && (
              <div
                className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                  economieMensuelle > 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <TrendingDown
                  className={`w-4 h-4 ${
                    economieMensuelle > 0 ? 'text-emerald-600' : 'text-red-600 rotate-180'
                  }`}
                />
                <span
                  className={`text-sm font-semibold ${
                    economieMensuelle > 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {economieMensuelle > 0 ? 'Économie' : 'Surcoût'}{' '}
                  {formatEuroValue(Math.abs(economieMensuelle))}/mois
                  {' · '}
                  {formatEuroValue(Math.abs(economieMensuelle) * 12)}/an
                </span>
              </div>
            )}
          </div>

          {/* Droite — synthèse détaillée */}
          <div className="flex flex-col gap-2.5 justify-center">
            {cart.margeErreur && (
              <p role="alert" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {cart.margeErreur}
              </p>
            )}
            {breakdown.map((row) => {
              const isEditableLoyerRow = row.key === 'loyer_mensuel' && loyerModifiable && cart.loyer != null;
              const isEditableMargeRow = row.key === 'marge' && !autoMargeMode;
              const loyerCalcule = cart.loyer?.loyer_calcule;
              const isLoyerModified = isEditableLoyerRow && loyerCalcule != null;
              const commitLoyerDraft = () => {
                const v = parseFloat(loyerDraft.replace(',', '.'));
                if (Number.isFinite(v) && v >= 0 && v !== row.value) {
                  handleUpdateLoyerManuel(v);
                }
                setEditingLoyer(false);
              };
              const commitMargeDraft = () => {
                const v = parseFloat(margeDraft.replace(',', '.'));
                if (Number.isFinite(v) && v !== row.value) {
                  handleUpdateMarge(v);
                }
                setEditingMargeHero(false);
              };

              return (
                <Fragment key={row.key}>
                  {row.key === firstLoyerRow && (
                    <p className="pt-2 border-t border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Loyer et ajustements
                    </p>
                  )}
                  <div
                    className={`flex flex-col ${
                      row.detail
                        ? 'text-xs pl-3 -mt-1.5'
                        : 'text-sm py-2 border-b border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`min-w-0 ${
                          row.detail ? 'text-slate-500' : 'text-slate-600 font-medium'
                        } flex items-center gap-1.5`}
                      >
                        {(row.key === 'fas' || row.key === 'installations') && (
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {row.key === 'cadeaux' && <Gift className="w-3.5 h-3.5 shrink-0" />}
                        {row.label}
                      </span>
                      <span className="shrink-0 flex items-center gap-1.5 tabular-nums">
                        {isEditableLoyerRow && editingLoyer ? (
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            step={0.01}
                            value={loyerDraft}
                            onChange={(e) => setLoyerDraft(e.target.value)}
                            onBlur={commitLoyerDraft}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitLoyerDraft();
                              if (e.key === 'Escape') setEditingLoyer(false);
                            }}
                            className="w-24 rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-sm font-semibold text-blue-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : isEditableMargeRow && editingMargeHero ? (
                          <input
                            autoFocus
                            type="number"
                            step={1}
                            value={margeDraft}
                            onChange={(e) => setMargeDraft(e.target.value)}
                            onBlur={commitMargeDraft}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitMargeDraft();
                              if (e.key === 'Escape') setEditingMargeHero(false);
                            }}
                            className="w-24 rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-sm font-semibold text-blue-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <span
                            className={`${
                              row.key === 'marge' && row.value > 0
                                ? 'text-emerald-700'
                                : row.key === 'marge' && row.value < 0
                                  ? 'text-red-600'
                                  : 'text-slate-900'
                            } ${row.detail ? '' : 'font-semibold'}`}
                          >
                            {formatEuroValue(row.value)}
                          </span>
                        )}
                        {isEditableLoyerRow && !editingLoyer && (
                          <button
                            type="button"
                            onClick={() => {
                              setLoyerDraft(String(Math.round(row.value * 100) / 100));
                              setEditingLoyer(true);
                            }}
                            title="Modifier le loyer mensuel"
                            className={`rounded p-1 transition-colors hover:bg-blue-50 ${
                              isLoyerModified
                                ? 'text-blue-600'
                                : 'text-slate-400 hover:text-slate-700'
                            }`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isEditableMargeRow && !editingMargeHero && (
                          <button
                            type="button"
                            onClick={() => {
                              setMargeDraft(String(Math.round(row.value * 100) / 100));
                              setEditingMargeHero(true);
                            }}
                            title="Modifier la marge"
                            className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-slate-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    {isLoyerModified && loyerCalcule != null && (
                      <div className="flex items-center justify-between text-xs text-blue-600 mt-1">
                        <span>Modifié manuellement (calculé : {formatEuroValue(loyerCalcule)})</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateLoyerManuel(null)}
                          className="underline hover:text-blue-800 font-medium"
                        >
                          Rétablir
                        </button>
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Grille des cadres produits + FAS + Cadeaux (tous affichés si visibles dans spLibelles) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cadre Mobile */}
        {visible('mobile') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {lbl('mobile')} ({grouped.mobile.length})
              </h3>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {formatEuroValue(abosMobile)}/mois
              </span>
            </div>
            <div className="divide-y divide-slate-100 flex-1">
              {grouped.mobile.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">
                  Aucun produit {lbl('mobile').toLowerCase()}.
                </p>
              ) : (
                grouped.mobile.map((line) => (
                  <ProductLineRow
                    key={`${line.instanceId}-${line.produitId ?? line.produitNom}`}
                    line={line}
                    catalogueProduct={line.produitId ? catalogueMap.get(line.produitId) : undefined}
                    badgeColorClass="bg-blue-50 text-blue-700"
                    saNumeros={saNumeros}
                    usedNumeroDigits={usedNumeroDigits}
                    onUpdate={(field, value) => handleUpdateLine(line, field, value)}
                    onUpdateNumero={(num) => handleUpdateNumero(line, num)}
                    onDelete={() => handleDeleteLine(line)}
                  />
                ))
              )}
            </div>
            <CategoryProductAdder
              frameCategory="mobile"
              frameLabel={lbl('mobile')}
              catalogue={catalogue}
              onAddProduct={handleAddProduct}
            />
          </div>
        )}

        {/* Cadre Fixe */}
        {visible('fixe') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {lbl('fixe')} ({grouped.fixe.length})
              </h3>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {formatEuroValue(abosFixe)}/mois
              </span>
            </div>
            <div className="divide-y divide-slate-100 flex-1">
              {grouped.fixe.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">
                  Aucun produit {lbl('fixe').toLowerCase()}.
                </p>
              ) : (
                grouped.fixe.map((line) => (
                  <ProductLineRow
                    key={`${line.instanceId}-${line.produitId ?? line.produitNom}`}
                    line={line}
                    catalogueProduct={line.produitId ? catalogueMap.get(line.produitId) : undefined}
                    badgeColorClass="bg-indigo-50 text-indigo-700"
                    saNumeros={saNumeros}
                    usedNumeroDigits={usedNumeroDigits}
                    onUpdate={(field, value) => handleUpdateLine(line, field, value)}
                    onUpdateNumero={(num) => handleUpdateNumero(line, num)}
                    onDelete={() => handleDeleteLine(line)}
                  />
                ))
              )}
            </div>
            <CategoryProductAdder
              frameCategory="fixe"
              frameLabel={lbl('fixe')}
              catalogue={catalogue}
              onAddProduct={handleAddProduct}
            />
          </div>
        )}

        {/* Cadre Internet */}
        {visible('internet') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {lbl('internet')} ({grouped.internet.length})
              </h3>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {formatEuroValue(abosInternet)}/mois
              </span>
            </div>
            <div className="divide-y divide-slate-100 flex-1">
              {grouped.internet.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">
                  Aucun produit {lbl('internet').toLowerCase()}.
                </p>
              ) : (
                grouped.internet.map((line) => (
                  <ProductLineRow
                    key={`${line.instanceId}-${line.produitId ?? line.produitNom}`}
                    line={line}
                    catalogueProduct={line.produitId ? catalogueMap.get(line.produitId) : undefined}
                    badgeColorClass="bg-teal-50 text-teal-700"
                    saNumeros={saNumeros}
                    usedNumeroDigits={usedNumeroDigits}
                    onUpdate={(field, value) => handleUpdateLine(line, field, value)}
                    onDelete={() => handleDeleteLine(line)}
                  />
                ))
              )}
            </div>
            <CategoryProductAdder
              frameCategory="internet"
              frameLabel={lbl('internet')}
              catalogue={catalogue}
              onAddProduct={handleAddProduct}
            />
          </div>
        )}

        {/* Cadre Matériel & Installations */}
        {visible('materiel') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {lbl('materiel')} ({grouped.materiel.length})
              </h3>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {formatEuroValue(materielTotalFinal + installationsTotal + cart.autresPonctuels)}
              </span>
            </div>
            <div className="divide-y divide-slate-100 flex-1">
              {grouped.materiel.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">
                  Aucun produit {lbl('materiel').toLowerCase()}.
                </p>
              ) : (
                grouped.materiel.map((line) => (
                  <ProductLineRow
                    key={`${line.instanceId}-${line.produitId ?? line.produitNom}`}
                    line={line}
                    catalogueProduct={resolveCatalogueProduct(line)}
                    badgeColorClass="bg-orange-50 text-orange-700"
                    saNumeros={saNumeros}
                    usedNumeroDigits={usedNumeroDigits}
                    onUpdate={(field, value) => handleUpdateLine(line, field, value)}
                    onDelete={() => handleDeleteLine(line)}
                  />
                ))
              )}
            </div>
            <CategoryProductAdder
              frameCategory="materiel"
              frameLabel={lbl('materiel')}
              catalogue={catalogue}
              onAddProduct={handleAddProduct}
            />
          </div>
        )}

        {/* Cadre FAS */}
        {visible('fas') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-900">{lbl('fas')}</h3>
              </div>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {formatEuroValue(fasTotalFinal)}
              </span>
            </div>
            <div className="divide-y divide-slate-100 flex-1">
              {cart.lines.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">
                  Ajoutez un produit pour renseigner des frais {lbl('fas')}.
                </p>
              ) : (
                cart.lines
                  .filter((line) => line.fasTotal > 0)
                  .map((line) => (
                    <div
                      key={`fas-${line.instanceId}-${line.produitId ?? line.produitNom}`}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-slate-700 truncate min-w-0 flex-1">{line.produitNom}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          ponctuel
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={Math.round(line.fasTotal * 100) / 100}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v >= 0) handleUpdateLine(line, 'fas', v);
                          }}
                          className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-xs text-slate-500">€</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateLine(line, 'fas', 0)}
                          title="Retirer le FAS de ce produit"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
              {cart.lines.length > 0 && grouped.fas.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-400 italic">
                  Aucun FAS actif (vous pouvez en ajouter via l’icône crayon sur un produit ou ci-dessous).
                </p>
              )}
            </div>
            {cart.lines.some((line) => line.fasTotal === 0) && (
              <div className="px-4 py-2.5 bg-slate-50/50 border-t border-slate-100 flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <select
                  value=""
                  onChange={(e) => {
                    const target = cart.lines.find(
                      (l) => `${l.instanceId}::${l.produitId ?? l.produitNom}` === e.target.value,
                    );
                    if (!target) return;
                    const cat = target.produitId ? catalogueMap.get(target.produitId) : undefined;
                    const defaultFas = cat?.prix_installation && cat.prix_installation > 0 ? cat.prix_installation : 50;
                    handleUpdateLine(target, 'fas', defaultFas);
                  }}
                  className="text-xs text-blue-600 font-medium bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="">Ajouter un FAS sur un produit du panier…</option>
                  {cart.lines
                    .filter((line) => line.fasTotal === 0)
                    .map((line) => {
                      const k = `${line.instanceId}::${line.produitId ?? line.produitNom}`;
                      return (
                        <option key={k} value={k}>
                          {line.produitNom}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Cadre Cadeaux / Avantages */}
        {visible('cadeaux') && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-slate-500" />
                {lbl('cadeaux')} ({grouped.cadeaux.length})
              </h3>
              <span className="text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">
                {formatEuroValue(cadeauxTotalFinal)}
              </span>
            </div>
            <div className="divide-y divide-slate-100 flex-1">
              {grouped.cadeaux.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">
                  Aucun élément dans {lbl('cadeaux').toLowerCase()}.
                </p>
              ) : (
                grouped.cadeaux.map((line) => (
                  <ProductLineRow
                    key={`${line.instanceId}-${line.produitId ?? line.produitNom}`}
                    line={line}
                    catalogueProduct={resolveCatalogueProduct(line)}
                    badgeColorClass="bg-pink-50 text-pink-700"
                    saNumeros={saNumeros}
                    usedNumeroDigits={usedNumeroDigits}
                    onUpdate={(field, value) => handleUpdateLine(line, field, value)}
                    onDelete={() => handleDeleteLine(line)}
                  />
                ))
              )}
            </div>
            <CategoryProductAdder
              frameCategory="cadeaux"
              frameLabel={lbl('cadeaux')}
              catalogue={catalogue}
              onAddProduct={handleAddProduct}
            />
          </div>
        )}
      </div>

      {/* ── Cadre Indemnités & remises ── */}
      {(visible('indemnites') ||
        visible('remise_mois_offert') ||
        visible('marge') ||
        eligibleDiscountProducts.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900 text-sm">Indemnités &amp; remises</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {visible('indemnites') && (
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">{lbl('indemnites')}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={Math.round(indemnitesTotalFinal * 100) / 100}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleUpdateIndemnites(Number.isFinite(v) ? v : 0);
                    }}
                    className="w-28 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">€</span>
                </div>
              </div>
            )}

            {visible('remise_mois_offert') && (
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">
                  {lbl('remise_mois_offert')}
                  {cart.loyer?.mois_offerts ? ` (${cart.loyer.mois_offerts} mois)` : ''}
                </span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  -{formatEuroValue(remiseMoisOffertFinal)}
                </span>
              </div>
            )}

            {visible('marge') && !autoMargeMode && (
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">{lbl('marge')}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step={1}
                    value={Math.round(cart.marge * 100) / 100}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleUpdateMarge(Number.isFinite(v) ? v : 0);
                    }}
                    className="w-28 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">€</span>
                </div>
              </div>
            )}

            {visible('loyer_mensuel') && loyerModifiable && cart.loyer && (
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-600">{lbl('loyer_mensuel')} (forcé manuellement)</span>
                  {cart.loyer.loyer_calcule != null && (
                    <span className="ml-2 text-xs text-blue-600">
                      (calculé : {formatEuroValue(cart.loyer.loyer_calcule)})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={Math.round(cart.loyer.loyer_mensuel * 100) / 100}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v >= 0) handleUpdateLoyerManuel(v);
                    }}
                    className="w-28 rounded border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">€/mois</span>
                  {cart.loyer.loyer_calcule != null && (
                    <button
                      type="button"
                      onClick={() => handleUpdateLoyerManuel(null)}
                      className="text-xs text-blue-600 underline hover:text-blue-800"
                    >
                      Rétablir
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Remises opérateur (mode manuel avec bloc dédié et bouton Appliquer) */}
            {modeRemisesOperateur === 'manuel' && eligibleDiscountProducts.length > 0 && (
              <div className="p-4 space-y-3 bg-emerald-50/30">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      Remises opérateur éligibles ({eligibleDiscountProducts.length})
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vérifiez ou ajustez les prix mensuels remisés, puis cliquez sur « Appliquer les remises ».
                    </p>
                  </div>
                  {hasAppliedDiscounts && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Remises appliquées
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {eligibleDiscountProducts.map((p) => {
                    const computedPrix = calculerPrixRemiseProduit(p);
                    const appliedPrix = appliedDiscountsMap[p.id] ?? appliedDiscountsMap[p.nom];
                    const overrideStr = discountOverrides[p.id];
                    const effectivePrix =
                      overrideStr !== undefined && overrideStr.trim() !== ''
                        ? Number(overrideStr.replace(',', '.'))
                        : (appliedPrix ?? computedPrix);
                    const remiseBadge =
                      p.remise_valeur != null
                        ? p.remise_type === 'fixe'
                          ? `-${formatEuroValue(p.remise_valeur)}/mois`
                          : `-${p.remise_valeur}%`
                        : '';
                    const isEditingThis = editingDiscountProductId === p.id;

                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate">{p.nom}</p>
                            <p className="text-xs text-slate-500">
                              {formatEuroValue(p.prix_mensuel ?? 0)}/mois →{' '}
                              <strong className="text-emerald-700">
                                {effectivePrix != null && Number.isFinite(effectivePrix)
                                  ? `${formatEuroValue(effectivePrix)}/mois`
                                  : '—'}
                              </strong>
                            </p>
                          </div>
                          {remiseBadge && (
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {remiseBadge}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDiscountProductId((cur) => (cur === p.id ? null : p.id));
                              if (overrideStr === undefined && effectivePrix != null) {
                                setDiscountOverrides((prev) => ({
                                  ...prev,
                                  [p.id]: String(Math.round(effectivePrix * 100) / 100),
                                }));
                              }
                            }}
                            title="Modifier le prix remisé"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
                          >
                            {isEditingThis ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Pencil className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {isEditingThis && (
                          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                            <label className="text-xs text-slate-600">
                              Prix unitaire remisé (€/mois) :
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={
                                overrideStr ??
                                (effectivePrix != null
                                  ? String(Math.round(effectivePrix * 100) / 100)
                                  : '')
                              }
                              onChange={(e) =>
                                setDiscountOverrides((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              className="h-7 w-24 rounded border border-emerald-300 bg-white px-2 text-xs font-semibold text-slate-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApplyManualDiscounts}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {hasAppliedDiscounts ? 'Mettre à jour les remises' : 'Appliquer les remises'}
                  </button>
                  {hasAppliedDiscounts && (
                    <button
                      type="button"
                      onClick={handleRemoveDiscounts}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Retirer les remises
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Indication en mode automatique des remises opérateur */}
            {modeRemisesOperateur === 'automatique' && eligibleDiscountProducts.length > 0 && (
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm bg-emerald-50/40">
                <span className="text-emerald-800 font-medium">
                  Remises opérateur ({eligibleDiscountProducts.length} produit
                  {eligibleDiscountProducts.length > 1 ? 's' : ''} remisé
                  {eligibleDiscountProducts.length > 1 ? 's' : ''} automatiquement)
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Calcul automatique actif
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cadre Client & adresses (PS1 : Coordonnées du client + adresses modifiables) ── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900 text-sm">Client &amp; adresses</h3>
          </div>
          <button
            type="button"
            onClick={() => setEditingClientSection((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              editingClientSection
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            {editingClientSection ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Terminer
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </>
            )}
          </button>
        </div>

        {!editingClientSection ? (
          <div className="p-4 space-y-4">
            {fournisseurPropose && (
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">
                  Fournisseur proposé
                </p>
                <p className="text-sm font-semibold text-slate-900">{fournisseurPropose}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">
                  Coordonnées du client
                </p>
                <div className="text-sm text-slate-800 space-y-0.5">
                  {clientEdit.raison_sociale && (
                    <p className="font-semibold text-slate-900">{clientEdit.raison_sociale}</p>
                  )}
                  {(clientEdit.prenom || clientEdit.nom || clientEdit.fonction) && (
                    <p>
                      {[clientEdit.prenom, clientEdit.nom].filter(Boolean).join(' ')}
                      {clientEdit.fonction ? ` — ${clientEdit.fonction}` : ''}
                    </p>
                  )}
                  {clientEdit.email && <p className="text-slate-600">{clientEdit.email}</p>}
                  {(clientEdit.mobile || clientEdit.fixe) && (
                    <p className="text-slate-600">
                      {[
                        clientEdit.mobile ? `Mob : ${clientEdit.mobile}` : '',
                        clientEdit.fixe ? `Fixe : ${clientEdit.fixe}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {clientEdit.siret && (
                    <p className="text-xs text-slate-500">SIRET : {clientEdit.siret}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">
                    Adresse de facturation
                  </p>
                  <p className="text-sm text-slate-800">
                    {[
                      clientEdit.raison_sociale,
                      clientEdit.adresse,
                      [clientEdit.code_postal, clientEdit.ville].filter(Boolean).join(' '),
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Non renseignée'}
                  </p>
                </div>

                {!livraisonIdentique && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">
                      Adresse de livraison
                    </p>
                    <p className="text-sm text-slate-800">
                      {[
                        adresseLivraisonEdit.raison_sociale,
                        adresseLivraisonEdit.adresse,
                        [adresseLivraisonEdit.code_postal, adresseLivraisonEdit.ville]
                          .filter(Boolean)
                          .join(' '),
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Non renseignée'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-0.5 block">
                Fournisseur proposé
              </label>
              <input
                type="text"
                value={fournisseurPropose}
                onChange={(e) => handleFournisseurChange(e.target.value)}
                placeholder="Ex : Orange, Bouygues Telecom, SFR…"
                className="h-8 text-sm border border-gray-300 rounded px-2 w-full max-w-md"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Coordonnées du client &amp; Adresse de facturation
              </p>
              <ClientCoordonneesFields
                idPrefix="resume-client-factu"
                value={clientEdit}
                onChange={handleClientFieldChange}
              />
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={livraisonIdentique}
                  onChange={(e) => handleLivraisonIdentiqueChange(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Adresse de livraison identique à l’adresse de facturation
              </label>

              {!livraisonIdentique && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    Adresse de livraison
                  </p>
                  <ClientCoordonneesFields
                    idPrefix="resume-client-livr"
                    value={adresseLivraisonEdit}
                    onChange={handleLivraisonFieldChange}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Réponses au questionnaire SP (Lecture seule) ── */}
      {questionResponses.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">
              Réponses au questionnaire SP ({questionResponses.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {questionResponses.map((reponse, index) => {
              const question = questionsById.get(reponse.question_id);
              return (
                <div key={`${reponse.question_id}-${index}`} className="p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {question?.libelle || formatFieldName(reponse.question_id)}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{formatSpValue(reponse.valeur)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Objectifs Accomplis ── */}
      {resolvedObjectifs.length > 0 && (
        <SpObjectifsAccomplis resolvedObjectifs={resolvedObjectifs} />
      )}
    </div>
  );
}
