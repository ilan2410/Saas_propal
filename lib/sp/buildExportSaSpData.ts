import type {
  CatalogueProduit,
  ExportSaSpInput,
  RecapExportLine,
  SaExportLine,
  SpExportLine,
  SpQuestion,
  SpQuestionReponse,
} from '@/types';
import type { SpCartSummary, CartLine } from './calculateCart';
import { calculateSaCartSummary, type SaCartLine } from './calculateSaCart';

// ── Helpers ──────────────────────────────────────────────────────────

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

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getStr(item: Record<string, unknown>, key: string): string {
  const v = item[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function pickStr(item: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const s = getStr(item, k);
    if (s) return s;
  }
  return '';
}

function pickNumber(item: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = toNumber(item[k]);
    if (v > 0) return v;
  }
  return 0;
}

/** Parse une date "JJ/MM/AAAA" (ou variantes courantes) en Date, ou null. */
function parseFrDate(input: string): Date | null {
  if (!input) return null;
  const s = input.trim();
  // JJ/MM/AAAA ou JJ-MM-AAAA
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]) - 1;
    let y = Number(m1[3]);
    if (y < 100) y += 2000;
    const date = new Date(y, mo, d);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // ISO AAAA-MM-JJ
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    const date = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function diffMonths(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12
    + (to.getMonth() - from.getMonth())
    + (to.getDate() >= from.getDate() ? 0 : -1);
}

// ── 1. Coordonnées client ───────────────────────────────────────────

export interface ClientInfo {
  raisonSociale?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  tel?: string;
  email?: string;
  nom?: string;
  prenom?: string;
}

export function extractClientInfo(donneesExtraites: Record<string, unknown>): ClientInfo {
  const client = isRecord(donneesExtraites.client) ? donneesExtraites.client : {};
  return {
    raisonSociale: getStr(client, 'raison_sociale') || undefined,
    adresse: getStr(client, 'adresse') || undefined,
    codePostal: getStr(client, 'code_postal') || undefined,
    ville: getStr(client, 'ville') || undefined,
    tel: getStr(client, 'fixe') || getStr(client, 'mobile') || undefined,
    email: getStr(client, 'email') || undefined,
    nom: getStr(client, 'nom') || undefined,
    prenom: getStr(client, 'prenom') || undefined,
  };
}

// ── 2. Tableau Situation Actuelle ───────────────────────────────────

interface SaLineRaw {
  operateur: string;
  dateFinEngagement: string;
  quantite: number;
  offre: string;
  numero: string;
  prixHt: number;
  /** Mois restants jusqu'à la date de fin d'engagement (depuis aujourd'hui). */
  moisRestants: number;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Enrichit une SaCartLine (issue du panier SA) avec les méta-données
 * (numero, date d'engagement, quantité) en cherchant la ligne brute
 * correspondante dans `abonnements`, `lignes` ou `locations`.
 */
function enrichSaLine(
  cartLine: SaCartLine,
  donneesExtraites: Record<string, unknown>,
): SaLineRaw {
  const sa = isRecord(donneesExtraites.situation_actuelle)
    ? donneesExtraites.situation_actuelle
    : {};
  const today = new Date();

  const candidates: Array<{ arr: unknown[]; isLocation: boolean }> = [
    { arr: Array.isArray(sa.abonnements) ? sa.abonnements : [], isLocation: false },
    { arr: Array.isArray(sa.lignes) ? sa.lignes : [], isLocation: false },
    { arr: Array.isArray(sa.locations) ? sa.locations : [], isLocation: true },
  ];

  const normLibelle = normalize(cartLine.libelle);
  let matched: Record<string, unknown> | undefined;
  let matchedNumero = '';

  for (const { arr } of candidates) {
    for (const raw of arr) {
      if (!isRecord(raw)) continue;
      const candidateLibelle =
        pickStr(raw, ['libelle', 'libelle_contrat', 'forfait', 'materiel']) || '';
      const candidateMontant = pickNumber(raw, [
        'tarif_net_mensuel',
        'tarif_brut_mensuel',
        'loyer_net_mensuel',
        'loyer_brut_mensuel',
      ]);
      const sameMontant = Math.abs(candidateMontant - cartLine.montant) < 0.01;
      const normCandidate = normalize(candidateLibelle);
      const sameLibelle =
        normCandidate && (normCandidate === normLibelle
          || normCandidate.includes(normLibelle)
          || normLibelle.includes(normCandidate));
      if (sameLibelle && sameMontant) {
        matched = raw;
        break;
      }
      if (!matched && sameLibelle) {
        matched = raw;
      }
    }
    if (matched) break;
  }

  // Si pas matché, chercher une ligne du tableau `lignes` ayant le même libellé/forfait
  // pour récupérer au moins le numero_ligne (cas abonnement → ligne).
  if (!matched || !pickStr(matched, ['numero_ligne'])) {
    const lignesArr = Array.isArray(sa.lignes) ? sa.lignes : [];
    for (const raw of lignesArr) {
      if (!isRecord(raw)) continue;
      const forfait = pickStr(raw, ['forfait', 'libelle']);
      if (!forfait) continue;
      if (
        normalize(forfait) === normLibelle
        || normalize(forfait).includes(normLibelle)
        || normLibelle.includes(normalize(forfait))
      ) {
        const num = pickStr(raw, ['numero_ligne']);
        if (num) {
          matchedNumero = num;
          break;
        }
      }
    }
  }

  const operateur = matched ? pickStr(matched, ['operateur', 'fournisseur', 'leaser']) : cartLine.operateur || '';
  const dateFinEngagement = matched
    ? pickStr(matched, ['date_fin_engagement_source', 'date_limite_resiliation_calculee'])
    : '';
  const quantite = matched ? Math.max(1, toNumber(matched.quantite) || 1) : 1;
  const offre = cartLine.libelle;
  const numero = matched ? pickStr(matched, ['numero_ligne', 'reference_contrat']) || matchedNumero : matchedNumero;

  let moisRestants = 0;
  const date = parseFrDate(dateFinEngagement);
  if (date) moisRestants = Math.max(0, diffMonths(today, date));

  return {
    operateur: operateur || cartLine.operateur || '',
    dateFinEngagement,
    quantite,
    offre,
    numero,
    prixHt: cartLine.montant,
    moisRestants,
  };
}

function buildSaLinesRaw(donneesExtraites: Record<string, unknown>): SaLineRaw[] {
  // On s'appuie sur le panier SA (source de vérité du Total mensuel SA)
  // pour garantir que la somme du tableau = total panier SA.
  const summary = calculateSaCartSummary(donneesExtraites);
  return summary.details
    .filter((l) => {
      // Quand aboPrimary (totalFromOfficiel=true), seules les catégories
      // 'abonnement' et 'location' contribuent au totalMensuel : les lignes
      // (fixe/mobile/internet/autre) sont dans details à titre informatif.
      // On les exclut pour garantir somme(tableau) = totalMensuel du panier SA.
      if (summary.totalFromOfficiel) {
        return l.categorie === 'abonnement' || l.categorie === 'location';
      }
      return true;
    })
    .map((cartLine) => enrichSaLine(cartLine, donneesExtraites));
}

/**
 * Calcule les indemnités par ligne SA (max(0, mois_restants - 3) * tarif),
 * puis ajuste proportionnellement pour que la somme = totalIndemnitesCible.
 */
function distributeIndemnites(lines: SaLineRaw[], totalCible: number): number[] {
  const raw = lines.map((l) => Math.max(0, l.moisRestants - 3) * l.prixHt);
  const sum = raw.reduce((a, b) => a + b, 0);
  if (totalCible <= 0 || lines.length === 0) return raw.map(() => 0);
  if (sum <= 0) {
    // Aucune date / mois restants — répartir proportionnellement au prix HT.
    const totalPrix = lines.reduce((a, l) => a + l.prixHt, 0);
    if (totalPrix <= 0) {
      // Répartition uniforme
      const part = totalCible / lines.length;
      return lines.map(() => part);
    }
    return lines.map((l) => (l.prixHt / totalPrix) * totalCible);
  }
  const facteur = totalCible / sum;
  return raw.map((v) => v * facteur);
}

export function buildSituationActuelleLines(
  donneesExtraites: Record<string, unknown>,
  totalIndemnitesCible: number,
): { lines: SaExportLine[]; totalPrixHt: number; totalIndemnites: number } {
  const rawLines = buildSaLinesRaw(donneesExtraites);
  const indemnites = distributeIndemnites(rawLines, totalIndemnitesCible);

  const lines: SaExportLine[] = rawLines.map((l, i) => ({
    operateur: l.operateur,
    dateFinEngagement: l.dateFinEngagement,
    quantite: l.quantite,
    offre: l.offre,
    numero: l.numero,
    prixHt: l.prixHt,
    indemnites: indemnites[i] ?? 0,
  }));

  const totalPrixHt = lines.reduce((s, l) => s + l.prixHt, 0);
  const totalIndemnites = lines.reduce((s, l) => s + l.indemnites, 0);

  return { lines, totalPrixHt, totalIndemnites };
}

// ── 3. Numéros de boucle (labels par itération) ─────────────────────

/**
 * Reproduit la logique de SpQuestionnaireUI : pour chaque groupe de boucle,
 * calcule la liste des labels d'itération (ex : numéros de ligne capturés en SA).
 * Retourne une Map<groupe_boucle_id, string[]> avec les labels par itération.
 */
function buildLoopLabelsByGroup(
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
 * question d'origine est dans une boucle, sinon undefined.
 */
function resolveCartLineNumero(
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

// ── 4. Tableau Solution Proposée ────────────────────────────────────

function getOriginalPrixUnitaire(p: CatalogueProduit): number {
  if (p.type_frequence === 'mensuel') return p.prix_mensuel ?? 0;
  return p.prix_vente ?? 0;
}

export function buildSolutionProposeeLines(
  cart: SpCartSummary,
  catalogue: CatalogueProduit[],
  questions: SpQuestion[],
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
): { lines: SpExportLine[]; total: number } {
  const catalogueMap = new Map<string, CatalogueProduit>();
  for (const p of catalogue) {
    catalogueMap.set(p.id, p);
    catalogueMap.set(p.nom, p);
  }

  const loopLabels = buildLoopLabelsByGroup(questions, reponses, donneesExtraites);

  const lines: SpExportLine[] = [];
  let totalRemise = 0;

  for (const l of cart.lines) {
    if (l.type_frequence !== 'mensuel') continue;

    const produit = (l.produitId && catalogueMap.get(l.produitId))
      || catalogueMap.get(l.produitNom);
    const operateur = produit?.fournisseur ?? '';
    const quantite = Math.max(1, l.quantite || 1);
    const numeroBoucle = resolveCartLineNumero(l, questions, loopLabels);

    const prixOriginalUnitaire = produit ? getOriginalPrixUnitaire(produit) : l.prixTotal / quantite;
    const prixOriginalTotal = prixOriginalUnitaire * quantite;
    const remiseLigne = prixOriginalTotal - l.prixTotal;

    lines.push({
      operateur,
      quantite,
      offre: l.produitNom,
      numero: numeroBoucle || l.produitNom,
      prixUnitaire: prixOriginalUnitaire,
      prixTotal: prixOriginalTotal,
    });

    if (remiseLigne > 0.005) {
      totalRemise += remiseLigne;
    }
  }

  // Ligne synthétique "Remise" si au moins un produit est remisé
  if (totalRemise > 0.005) {
    lines.push({
      operateur: '',
      quantite: 1,
      offre: 'Remise opérateur',
      numero: '',
      prixUnitaire: 0,
      prixTotal: -totalRemise,
      isRemiseLine: true,
    });
  }

  const total = lines.reduce((s, l) => s + l.prixTotal, 0);
  return { lines, total };
}

// ── 5. Récapitulatif du dossier (matériel/instal/cadeaux/FAS) ───────

export function buildRecapMaterielLines(
  cart: SpCartSummary,
): { lines: RecapExportLine[]; total: number } {
  const lines: RecapExportLine[] = [];

  for (const l of cart.lines) {
    if (l.type_frequence !== 'unique') continue;
    let type: 'materiel' | 'installation' | 'cadeau' | null = null;
    if (l.categorie === 'equipement') type = 'materiel';
    else if (l.categorie === 'installation') type = 'installation';
    else if (l.categorie === 'cadeau') type = 'cadeau';
    if (!type) continue;
    const quantite = Math.max(1, l.quantite || 1);
    const puht = l.prixTotal / quantite;
    lines.push({
      type,
      libelle: l.produitNom,
      puht,
      quantite,
      ptht: l.prixTotal,
    });
  }

  // Ligne FAS unique (somme de tous les FAS)
  if (cart.fas > 0) {
    lines.push({
      type: 'fas',
      libelle: 'FAS',
      puht: null,
      quantite: null,
      ptht: cart.fas,
    });
  }

  // Ligne Marge commerciale
  if (cart.marge > 0) {
    lines.push({
      type: 'marge',
      libelle: 'Marge commerciale',
      puht: null,
      quantite: null,
      ptht: cart.marge,
    });
  }

  const total = lines.reduce((s, l) => s + l.ptht, 0);
  return { lines, total };
}

// ── 6. Construction finale ──────────────────────────────────────────

export interface BuildExportSaSpDataInput {
  cart: SpCartSummary;
  questions: SpQuestion[];
  reponses: SpQuestionReponse[];
  catalogue: CatalogueProduit[];
  donneesExtraites: Record<string, unknown>;
  companyName: string;
  primaryColor: string;
  logoUrl?: string;
}

export function buildExportSaSpData(input: BuildExportSaSpDataInput): ExportSaSpInput {
  const {
    cart,
    questions,
    reponses,
    catalogue,
    donneesExtraites,
    companyName,
    primaryColor,
    logoUrl,
  } = input;

  const client = extractClientInfo(donneesExtraites);

  const indemTotal = cart.indemnites; // déjà résolu par calculateCartSummary
  const sa = buildSituationActuelleLines(donneesExtraites, indemTotal);
  const sp = buildSolutionProposeeLines(cart, catalogue, questions, reponses, donneesExtraites);
  const recap = buildRecapMaterielLines(cart);

  // Total ponctuel = somme du tableau RECAPITULATIF (matériel + install + cadeaux + FAS + marge)
  // Doit être identique à recap.total pour cohérence avec le tableau RECAPITULATIF.
  const remiseTotalPonctuel = recap.total;
  const remiseTotal = cart.remiseMoisOffert + cart.indemnites + remiseTotalPonctuel;

  const dateProposition = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return {
    clientRaisonSociale: client.raisonSociale,
    clientAdresse: client.adresse,
    clientCp: client.codePostal,
    clientVille: client.ville,
    clientTel: client.tel,
    clientEmail: client.email,
    clientNom: client.nom,
    clientPrenom: client.prenom,
    dateProposition,

    companyName,
    primaryColor,
    logoUrl,

    saLines: sa.lines,
    saTotalPrixHt: sa.totalPrixHt,
    saTotalIndemnites: sa.totalIndemnites,

    spLines: sp.lines,
    spTotalPrix: sp.total,

    recapLines: recap.lines,
    recapTotal: recap.total,

    remiseMoisOffert: cart.remiseMoisOffert,
    remiseSoldeContrat: cart.indemnites,
    remiseTotalPonctuel,
    remiseTotal,

    codePromo: cart.codePromo,
  };
}
