import type {
  CatalogueProduit,
  CatalogueCategorie,
  SpQuestion,
  SpQuestionReponse,
  SpConfigLoyer,
  SpConfigMoisOfferts,
  SpProduitLibre,
  SpCodePromoInfo,
  SpPreferencesProduits,
} from '@/types';
import { calculerLoyer, calculerRemiseMoisOffert, DEFAULT_CONFIG_LOYER, type ResultatLoyer } from './calculLoyer';
import { findApplicableBareme } from './evaluateBareme';
import { collectQuestionVariableValues } from './questionVariables';
import { evaluateGroupes } from './evaluateConditions';

// ── Types ────────────────────────────────────────────────────────────

export interface CartLine {
  produitNom: string;
  produitId?: string;
  categorie: CatalogueCategorie;
  type_frequence: 'mensuel' | 'unique';
  quantite: number;
  /** Total price already multiplied by quantity (mensuel = €/mois, unique = € HT). */
  prixTotal: number;
  fasTotal: number;
  instanceId: string;
  /** Numéro de ligne rattaché (override panier, ou label de boucle). */
  numero?: string;
}

export interface SpCartSummary {
  abonnements: {
    fixe: number;
    mobile: number;
    internet: number;
    totalMensuel: number;
  };
  materiel: number;
  cadeaux: number;
  installations: number;
  fas: number;
  autresMensuels: number;
  autresPonctuels: number;
  totalPonctuel: number;
  remiseMoisOffert: number;
  indemnites: number;
  marge: number;
  baseLoyer: number;
  dureeMois: number;
  loyer: ResultatLoyer | null;
  lines: CartLine[];
  /** Code promo appliqué sur la marge (null si aucun). */
  codePromo: SpCodePromoInfo | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function findProduct(catalogue: CatalogueProduit[], key: string): CatalogueProduit | undefined {
  if (!key) return undefined;
  return catalogue.find((p) => p.id === key) ?? catalogue.find((p) => p.nom === key);
}

function parseJsonRecord(value: SpQuestionReponse['valeur']): Record<string, string> | null {
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

function getQuantite(reponses: SpQuestionReponse[], instanceId: string, produitNom: string): number {
  const rep = reponses.find((r) => r.question_id === `quantite_${instanceId}`);
  if (!rep) return 1;
  const asMap = parseJsonRecord(rep.valeur);
  if (asMap) {
    const q = Number(asMap[produitNom]);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }
  const q = Number(rep.valeur);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

function getFas(reponses: SpQuestionReponse[], instanceId: string, produitNom: string): number {
  const rep = reponses.find((r) => r.question_id === `fas_${instanceId}`);
  if (!rep) return 0;
  const asMap = parseJsonRecord(rep.valeur);
  if (asMap) {
    const v = Number(asMap[produitNom]);
    return Number.isFinite(v) ? v : 0;
  }
  const v = Number(rep.valeur);
  return Number.isFinite(v) ? v : 0;
}

function getPrixOverride(
  reponses: SpQuestionReponse[],
  instanceId: string,
  produitNom: string,
  produitId?: string,
): number | undefined {
  const rep = reponses.find((r) => r.question_id === `prix_${instanceId}`);
  if (!rep) return undefined;
  const asMap = parseJsonRecord(rep.valeur);
  if (asMap) {
    const candidates = [produitId, produitNom].filter((k): k is string => !!k);
    for (const k of candidates) {
      if (k in asMap) {
        const v = Number(asMap[k]);
        if (Number.isFinite(v)) return v;
      }
    }
    return undefined;
  }
  const v = Number(rep.valeur);
  return Number.isFinite(v) ? v : undefined;
}

function getNumeroOverride(
  reponses: SpQuestionReponse[],
  instanceId: string,
  produitNom: string,
  produitId?: string,
): string | undefined {
  const rep = reponses.find((r) => r.question_id === `numero_${instanceId}`);
  if (!rep) return undefined;
  const asMap = parseJsonRecord(rep.valeur);
  if (asMap) {
    const candidates = [produitId, produitNom].filter((k): k is string => !!k);
    for (const k of candidates) {
      if (k in asMap) {
        const v = asMap[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return undefined;
  }
  if (typeof rep.valeur === 'string' && rep.valeur.trim()) return rep.valeur.trim();
  return undefined;
}

function defaultPrixUnitaire(p: CatalogueProduit): number {
  if (p.type_frequence === 'mensuel') return p.prix_mensuel ?? 0;
  return p.prix_vente ?? 0;
}

function parseLibreReponse(
  reponses: SpQuestionReponse[],
  instanceId: string,
): SpProduitLibre | null {
  const rep = reponses.find((r) => r.question_id === 'libre_' + instanceId);
  if (!rep || typeof rep.valeur !== 'string') return null;
  try {
    const parsed = JSON.parse(rep.valeur);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.label === 'string' &&
      typeof parsed.prix === 'number' &&
      typeof parsed.categorie === 'string'
    ) {
      return parsed as SpProduitLibre;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const FREE_ENTRY_MARKER = '__libre__';

/** Préfixe des réponses correspondant à un produit ajouté manuellement depuis le panier. */
export const MANUAL_PRODUCT_PREFIX = 'manual_';

// ── Numéros de boucle (labels par itération) ─────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Reproduit la logique de SpQuestionnaireUI : pour chaque groupe de boucle,
 * calcule la liste des labels d'itération (ex : numéros de ligne capturés en SA).
 * Retourne une Map<groupe_boucle_id, string[]> avec les labels par itération.
 */
export function buildLoopLabelsByGroup(
  questions: SpQuestion[],
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const seenGroups = new Set<string>();

  for (const q of questions) {
    if (!q.boucle || !q.groupe_boucle_id) continue;
    if (seenGroups.has(q.groupe_boucle_id)) continue;
    seenGroups.add(q.groupe_boucle_id);

    let iterationCount = q.boucle.nombre_fixe ?? 1;
    const labels: string[] = [];

    let loopItemsFromSa: Record<string, unknown>[] = [];
    if (q.boucle.source_sa_array) {
      const value = getNestedValue(donneesExtraites, q.boucle.source_sa_array);
      if (Array.isArray(value)) {
        loopItemsFromSa = value.filter(
          (item): item is Record<string, unknown> => isRecord(item),
        );
        if (q.boucle.source_sa_filtre_champ && q.boucle.source_sa_filtre_valeur) {
          const expected = q.boucle.source_sa_filtre_valeur.trim().toLowerCase();
          loopItemsFromSa = loopItemsFromSa.filter(
            (item) =>
              String(item[q.boucle!.source_sa_filtre_champ!] ?? '')
                .trim()
                .toLowerCase() === expected,
          );
        }
      }
    }

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

    const finalLabels: string[] = [];
    for (let iter = 0; iter < iterationCount; iter++) {
      const editedRep = reponses.find(
        (r) => r.question_id === `loop_label__${q.groupe_boucle_id}__iter_${iter}`,
      );
      const editedLabel =
        editedRep && typeof editedRep.valeur === 'string' ? editedRep.valeur.trim() : '';
      finalLabels.push(
        editedLabel || labels[iter] || `${q.boucle.label_prefix || 'Item'} ${iter + 1}`,
      );
    }
    out.set(q.groupe_boucle_id, finalLabels);
  }

  return out;
}

/**
 * Pour un CartLine, retourne le label d'itération (numéro de ligne) si la
 * question d'origine est dans une boucle, sinon ''.
 */
export function resolveCartLineNumero(
  line: CartLine,
  questions: SpQuestion[],
  loopLabels: Map<string, string[]>,
): string {
  const instanceId = line.instanceId;
  const iterMatch = instanceId.match(/__iter_(\d+)$/);
  if (!iterMatch) return '';
  const iterIndex = Number(iterMatch[1]);
  const baseQId = instanceId.replace(/__iter_\d+$/, '');
  const question = questions.find((q) => q.id === baseQId);
  if (!question || !question.groupe_boucle_id) return '';
  const labels = loopLabels.get(question.groupe_boucle_id);
  if (!labels) return '';
  return labels[iterIndex] || '';
}

// ── Core ─────────────────────────────────────────────────────────────

/**
 * Build the real-time SP cart summary from current responses.
 * - Aggregates monthly subscriptions (fixe / mobile / internet)
 * - Aggregates one-shot costs (matériel / installations / FAS)
 * - Computes loyer using configured barème (or default)
 */
export function calculateCartSummary(
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  catalogue: CatalogueProduit[],
  donneesExtraites: Record<string, unknown> = {},
  spConfigLoyer?: SpConfigLoyer,
  spConfigMoisOfferts?: SpConfigMoisOfferts,
  spPreferencesProduits?: SpPreferencesProduits,
): SpCartSummary {
  const lines: CartLine[] = [];

  // Index questions by id for quick lookup
  const questionById = new Map<string, SpQuestion>();
  for (const q of questions) questionById.set(q.id, q);

  // 1. Collect catalogue selections (non-remise questions)
  for (const rep of reponses) {
    if (rep.question_id.startsWith('fas_')) continue;
    if (rep.question_id.startsWith('prix_')) continue;
    if (rep.question_id.startsWith('quantite_')) continue;
    if (rep.question_id.startsWith('__skip__')) continue;

    const baseQId = rep.question_id.replace(/__iter_\d+$/, '');
    const question = questionById.get(baseQId);
    if (!question) continue;
    if (question.source !== 'catalogue') continue;
    if (question.affichage === 'remise_produits') continue;

    const selectedNames: string[] = Array.isArray(rep.valeur)
      ? rep.valeur.map((v) => String(v))
      : typeof rep.valeur === 'string'
        ? [rep.valeur]
        : [];

    for (const nom of selectedNames) {
      if (nom === FREE_ENTRY_MARKER) {
        const libre = parseLibreReponse(reponses, rep.question_id);
        if (libre) {
          const quantite = getQuantite(reponses, rep.question_id, libre.label);
          const prixOverride = getPrixOverride(reponses, rep.question_id, libre.label, undefined);
          const prixTotal = prixOverride != null
            ? prixOverride
            : libre.prix * quantite;
          const fasOverride = getFas(reponses, rep.question_id, libre.label);
          lines.push({
            produitNom: libre.label,
            categorie: libre.categorie,
            type_frequence: libre.type_frequence ?? 'unique',
            quantite,
            prixTotal,
            fasTotal: fasOverride || 0,
            instanceId: rep.question_id,
          });
        }
        continue;
      }

      const produit = findProduct(catalogue, nom);
      if (!produit) continue;

      const quantite = getQuantite(reponses, rep.question_id, nom);
      const prixOverride = getPrixOverride(reponses, rep.question_id, nom, produit.id);
      // Stored price overrides are TOTAL (already × qty). If no override, compute from default.
      const prixTotal = prixOverride != null
        ? prixOverride
        : defaultPrixUnitaire(produit) * quantite;
      const fasTotal = getFas(reponses, rep.question_id, nom);

      lines.push({
        produitNom: produit.nom,
        produitId: produit.id,
        categorie: produit.categorie,
        type_frequence: produit.type_frequence,
        quantite,
        prixTotal,
        fasTotal,
        instanceId: rep.question_id,
      });
    }
  }

  // 1b. Collect option products selected alongside a catalogue product
  for (const rep of reponses) {
    if (!rep.question_id.startsWith('options_')) continue;

    const optionKeys: string[] = Array.isArray(rep.valeur)
      ? rep.valeur.map((v) => String(v))
      : typeof rep.valeur === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(rep.valeur);
              return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [rep.valeur];
            } catch {
              return [rep.valeur];
            }
          })()
        : [];

    for (const key of optionKeys) {
      const produit = findProduct(catalogue, key);
      if (!produit) continue;
      const quantite = getQuantite(reponses, rep.question_id, produit.nom);
      const prixOverride = getPrixOverride(reponses, rep.question_id, produit.nom, produit.id);
      const prixTotal = prixOverride != null
        ? prixOverride
        : defaultPrixUnitaire(produit) * quantite;
      const fasOverride = getFas(reponses, rep.question_id, produit.nom);
      lines.push({
        produitNom: produit.nom,
        produitId: produit.id,
        categorie: produit.categorie,
        type_frequence: produit.type_frequence,
        quantite,
        prixTotal,
        fasTotal: fasOverride || produit.prix_installation || 0,
        instanceId: rep.question_id,
      });
    }
  }

  // 1c. Produits ajoutés manuellement depuis le panier (question_id = manual_<uid>)
  for (const rep of reponses) {
    if (!rep.question_id.startsWith(MANUAL_PRODUCT_PREFIX)) continue;
    const key = Array.isArray(rep.valeur)
      ? String(rep.valeur[0] ?? '')
      : typeof rep.valeur === 'string'
        ? rep.valeur
        : '';
    const produit = findProduct(catalogue, key);
    if (!produit) continue;

    const quantite = getQuantite(reponses, rep.question_id, produit.nom);
    const prixOverride = getPrixOverride(reponses, rep.question_id, produit.nom, produit.id);
    const prixTotal = prixOverride != null
      ? prixOverride
      : defaultPrixUnitaire(produit) * quantite;
    const fasTotal = getFas(reponses, rep.question_id, produit.nom);

    lines.push({
      produitNom: produit.nom,
      produitId: produit.id,
      categorie: produit.categorie,
      type_frequence: produit.type_frequence,
      quantite,
      prixTotal,
      fasTotal,
      instanceId: rep.question_id,
    });
  }

  // 2. Apply remise_produits overrides (per-unit monthly price stored by nom or id)
  for (const rep of reponses) {
    if (rep.question_id.startsWith('fas_')) continue;
    if (rep.question_id.startsWith('quantite_')) continue;
    if (!rep.question_id.startsWith('prix_')) continue;

    // Match a remise_produits parent question
    const parentId = rep.question_id.replace(/^prix_/, '');
    const parentBaseId = parentId.replace(/__iter_\d+$/, '');
    const parentQ = questionById.get(parentBaseId);
    if (!parentQ || parentQ.affichage !== 'remise_produits') continue;

    const priceMap = parseJsonRecord(rep.valeur);
    if (!priceMap) continue;

    for (const [key, value] of Object.entries(priceMap)) {
      const unitPrix = Number(value);
      if (!Number.isFinite(unitPrix)) continue;
      const target = findProduct(catalogue, key);
      if (!target) continue;

      // Override every existing mensual line for this product
      for (const line of lines) {
        if (line.type_frequence !== 'mensuel') continue;
        if (line.produitId === target.id || line.produitNom === target.nom) {
          line.prixTotal = unitPrix * line.quantite;
        }
      }
    }
  }

  // 2b. Inject auto-products from preferences
  if (spPreferencesProduits) {
    const alreadyAutoIds = new Set<string>();

    // Lignes auto supprimées manuellement depuis le panier (réponse auto_exclu)
    const excludedAuto = new Set<string>();
    const exclRep = reponses.find((r) => r.question_id === 'auto_exclu');
    if (exclRep && typeof exclRep.valeur === 'string') {
      try {
        const parsed = JSON.parse(exclRep.valeur);
        if (Array.isArray(parsed)) for (const id of parsed) excludedAuto.add(String(id));
      } catch {
        /* ignore */
      }
    }

    for (const produitId of spPreferencesProduits.produits_fixes_ids) {
      if (alreadyAutoIds.has(produitId)) continue;
      const p = catalogue.find((c) => c.id === produitId);
      if (!p || !p.actif) continue;
      alreadyAutoIds.add(produitId);
      const instanceId = `auto_fixed_${p.id}`;
      if (excludedAuto.has(instanceId)) continue;
      const quantite = getQuantite(reponses, instanceId, p.nom);
      const prixOverride = getPrixOverride(reponses, instanceId, p.nom, p.id);
      const prixTotal = prixOverride != null
        ? prixOverride
        : defaultPrixUnitaire(p) * quantite;
      const fasOverride = getFas(reponses, instanceId, p.nom);
      lines.push({
        produitNom: p.nom,
        produitId: p.id,
        categorie: p.categorie,
        type_frequence: p.type_frequence,
        quantite,
        prixTotal,
        fasTotal: fasOverride || p.prix_installation || 0,
        instanceId,
      });
    }

    for (const regle of spPreferencesProduits.regles_auto) {
      if (!regle.actif) continue;
      const condMet = evaluateGroupes(
        regle.groupes_conditions,
        regle.logique_declencheur,
        reponses,
        donneesExtraites,
        null,
        catalogue,
      );
      if (!condMet) continue;
      for (const produitId of regle.produits_ids) {
        if (alreadyAutoIds.has(`cond_${regle.id}_${produitId}`)) continue;
        const p = catalogue.find((c) => c.id === produitId);
        if (!p || !p.actif) continue;
        alreadyAutoIds.add(`cond_${regle.id}_${produitId}`);
        const instanceId = `auto_cond_${regle.id}_${p.id}`;
        if (excludedAuto.has(instanceId)) continue;
        const quantite = getQuantite(reponses, instanceId, p.nom);
        const prixOverride = getPrixOverride(reponses, instanceId, p.nom, p.id);
        const prixTotal = prixOverride != null
          ? prixOverride
          : defaultPrixUnitaire(p) * quantite;
        const fasOverride = getFas(reponses, instanceId, p.nom);
        lines.push({
          produitNom: p.nom,
          produitId: p.id,
          categorie: p.categorie,
          type_frequence: p.type_frequence,
          quantite,
          prixTotal,
          fasTotal: fasOverride || p.prix_installation || 0,
          instanceId,
        });
      }
    }
  }

  // 2c. Résoudre le numéro de chaque ligne : override panier > label de boucle.
  const loopLabels = buildLoopLabelsByGroup(questions, reponses, donneesExtraites);
  for (const line of lines) {
    const override = getNumeroOverride(reponses, line.instanceId, line.produitNom, line.produitId);
    line.numero = override ?? resolveCartLineNumero(line, questions, loopLabels) ?? '';
    if (!line.numero) delete line.numero;
  }

  // 3. Aggregate by category
  const abos = { fixe: 0, mobile: 0, internet: 0, totalMensuel: 0 };
  let materiel = 0;
  let cadeaux = 0;
  let installations = 0;
  let fas = 0;
  let autresMensuels = 0;
  let autresPonctuels = 0;

  for (const line of lines) {
    fas += line.fasTotal;
    if (line.type_frequence === 'mensuel') {
      switch (line.categorie) {
        case 'fixe':
          abos.fixe += line.prixTotal;
          break;
        case 'mobile':
          abos.mobile += line.prixTotal;
          break;
        case 'internet':
          abos.internet += line.prixTotal;
          break;
        default:
          autresMensuels += line.prixTotal;
      }
    } else {
      switch (line.categorie) {
        case 'equipement':
          materiel += line.prixTotal;
          break;
        case 'cadeau':
          cadeaux += line.prixTotal;
          break;
        case 'installation':
          installations += line.prixTotal;
          break;
        default:
          autresPonctuels += line.prixTotal;
      }
    }
  }
  abos.totalMensuel = abos.fixe + abos.mobile + abos.internet + autresMensuels;

  const totalPonctuel = materiel + cadeaux + installations + fas + autresPonctuels;

  // 4. Loyer
  const config = spConfigLoyer ?? DEFAULT_CONFIG_LOYER;
  const baremes = config.baremes ?? [];
  const bareme = findApplicableBareme(baremes, reponses, donneesExtraites, catalogue)
    ?? baremes[0]
    ?? null;

  // Résolution de la durée :
  //   1. Si la config lie la durée à une question SP → on lit la réponse correspondante.
  //   2. Sinon (ou si pas de réponse valide) → fallback sur duree_mois_par_defaut (par défaut 63).
  let dureeMois = config.duree_mois_par_defaut ?? 63;
  if (config.duree_depends_question && config.duree_question_id) {
    const targetId = config.duree_question_id;
    const dureeRep = reponses.find(
      (r) => r.question_id === targetId || r.question_id.startsWith(`${targetId}__iter_`),
    );
    if (dureeRep) {
      const raw = Array.isArray(dureeRep.valeur) ? dureeRep.valeur[0] : dureeRep.valeur;
      // Extrait le 1er nombre de la valeur (ex : "48 mois" → 48, 48 → 48)
      const match = String(raw ?? '').match(/-?\d+(?:[.,]\d+)?/);
      const v = match ? Number(match[0].replace(',', '.')) : NaN;
      if (Number.isFinite(v) && v > 0) dureeMois = v;
    }
  }
  // 5. Composantes additionnelles : remise mois offert, indemnités, marge
  const categoriesMoisOfferts = spConfigMoisOfferts?.categories_inclues ?? ['fixe', 'mobile'];
  let totalRecurrentMoisOfferts = 0;
  if (categoriesMoisOfferts.includes('fixe')) totalRecurrentMoisOfferts += abos.fixe;
  if (categoriesMoisOfferts.includes('mobile')) totalRecurrentMoisOfferts += abos.mobile;
  if (categoriesMoisOfferts.includes('internet')) totalRecurrentMoisOfferts += abos.internet;
  if (categoriesMoisOfferts.includes('autres_mensuels')) totalRecurrentMoisOfferts += autresMensuels;

  const remiseMoisOffert = bareme
    ? calculerRemiseMoisOffert(bareme, totalRecurrentMoisOfferts, dureeMois)
    : 0;

  const indemnites = resolveIndemnites(reponses, questions, donneesExtraites);

  const margeRep = reponses.find((r) => r.question_id === 'sp_marge_calculee');
  const marge = margeRep ? Number(margeRep.valeur) || 0 : 0;

  const baseLoyer = totalPonctuel + remiseMoisOffert + indemnites + marge;
  const loyer = bareme ? calculerLoyer(bareme, baseLoyer, dureeMois) : null;

  // Détail du code promo appliqué sur la marge (si renseigné lors du questionnaire)
  const codePromoNomRep = reponses.find((r) => r.question_id === 'sp_code_promo_nom');
  let codePromo: SpCodePromoInfo | null = null;
  if (codePromoNomRep && String(codePromoNomRep.valeur).trim()) {
    const valeurRep = reponses.find((r) => r.question_id === 'sp_code_promo_valeur');
    const modeRep = reponses.find((r) => r.question_id === 'sp_code_promo_mode');
    const margeAvantRep = reponses.find((r) => r.question_id === 'sp_marge_avant_promo');
    codePromo = {
      nom: String(codePromoNomRep.valeur),
      valeur: valeurRep ? Number(valeurRep.valeur) || 0 : 0,
      mode: String(modeRep?.valeur) === 'soustraction' ? 'soustraction' : 'addition',
      margeAvant: margeAvantRep ? Number(margeAvantRep.valeur) || 0 : 0,
    };
  }

  return {
    abonnements: abos,
    materiel,
    cadeaux,
    installations,
    fas,
    autresMensuels,
    autresPonctuels,
    totalPonctuel,
    remiseMoisOffert,
    indemnites,
    marge,
    baseLoyer,
    dureeMois,
    loyer,
    lines,
    codePromo,
  };
}

// ── Résolution indemnités ─────────────────────────────────────────────

function parseNumeric(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = String(value ?? '').match(/-?\d+(?:[.,]\d+)?/);
  const v = match ? Number(match[0].replace(',', '.')) : NaN;
  return Number.isFinite(v) ? v : 0;
}

export function resolveIndemnites(
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  donneesExtraites: Record<string, unknown>,
): number {
  // 1. Réponse SP directement sur question_id === 'sp_total_indemnites'
  const directRep = reponses.find((r) => r.question_id === 'sp_total_indemnites');
  if (directRep) {
    const v = parseNumeric(directRep.valeur);
    if (v > 0) return v;
  }
  // 2. Question SP avec conséquence `renseigner_variable` ciblant `sp_total_indemnites`
  const variables = collectQuestionVariableValues(questions, reponses);
  if (variables.sp_total_indemnites != null) {
    const v = parseNumeric(variables.sp_total_indemnites);
    if (v > 0) return v;
  }
  // 3. Question SP de type `nombre` avec `suggestion_source = 'indemnite_resiliation'`
  //    (fallback si la conséquence renseigner_variable n'a pas été configurée)
  const indemQuestion = questions.find(
    (q) =>
      q.affichage === 'nombre' &&
      q.nombre_config?.suggestion_source === 'indemnite_resiliation',
  );
  if (indemQuestion) {
    const indemQRep = reponses.find(
      (r) =>
        r.question_id === indemQuestion.id ||
        r.question_id.startsWith(`${indemQuestion.id}__iter_`),
    );
    if (indemQRep) {
      const v = parseNumeric(indemQRep.valeur);
      if (v > 0) return v;
    }
  }
  // 2. donneesExtraites.sp_total_indemnites (string ou number)
  const direct = (donneesExtraites as Record<string, unknown>)?.sp_total_indemnites;
  if (direct != null) {
    const match = String(direct).match(/-?\d+(?:[.,]\d+)?/);
    const v = match ? Number(match[0].replace(',', '.')) : NaN;
    if (Number.isFinite(v) && v > 0) return v;
  }
  // 3. donneesExtraites.situation_actuelle?.indemnites?.total ou montants imbriqués
  const sa = (donneesExtraites as Record<string, unknown>)?.situation_actuelle;
  if (sa && typeof sa === 'object') {
    const indem = (sa as Record<string, unknown>).indemnites;
    if (indem && typeof indem === 'object') {
      const total = (indem as Record<string, unknown>).total
        ?? (indem as Record<string, unknown>).montant
        ?? (indem as Record<string, unknown>).montant_retenu;
      if (total != null) {
        const match = String(total).match(/-?\d+(?:[.,]\d+)?/);
        const v = match ? Number(match[0].replace(',', '.')) : NaN;
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
  }
  return 0;
}
