/**
 * Helpers partagés pour la préparation des données Word.
 * Extraits de @/lib/generators/index.ts afin d'être réutilisés par
 * l'aperçu de template (app/api/templates/preview-word).
 * Comportement identique à la génération réelle.
 */

import { buildSituationActuelleLines } from '@/lib/sp/buildExportSaSpData';

export type UnknownRecord = Record<string, unknown>;

export function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickFirstDefined(obj: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function pickFirstString(obj: UnknownRecord, keys: string[]): string | undefined {
  const value = pickFirstDefined(obj, keys);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function inferSaLineType(item: UnknownRecord, arrayKey: string): string | undefined {
  const explicitType = pickFirstString(item, ['type']);
  if (explicitType) return explicitType;
  const normalizedKey = arrayKey.toLowerCase();
  if (normalizedKey.includes('mobile')) return 'mobile';
  if (normalizedKey.includes('fixe')) return 'fixe';
  if (normalizedKey.includes('internet')) return 'internet';
  if (normalizedKey.includes('materiel') || normalizedKey.includes('location')) return 'materiel';
  return undefined;
}

function looksLikeSaCommercialRow(item: UnknownRecord, arrayKey: string): boolean {
  const commercialArrays = new Set([
    'lignes',
    'lignes_mobiles',
    'lignes_fixes',
    'lignes_internet',
    'location_materiel',
    'abonnements',
    'locations',
  ]);
  if (commercialArrays.has(arrayKey)) return true;

  return [
    'numero_ligne',
    'forfait',
    'materiel',
    'quantite',
    'tarif',
    'tarif_net_mensuel',
    'tarif_brut_mensuel',
    'loyer_net_mensuel',
    'loyer_brut_mensuel',
  ].some((key) => item[key] !== undefined && item[key] !== null && item[key] !== '');
}

function sanitizeNumero(rawNumero: unknown, item: UnknownRecord, arrayKey: string, designation?: string): string {
  if (typeof rawNumero !== 'string' || !rawNumero.trim()) return '';
  const numero = rawNumero.trim();
  const normalizedNumero = normalizeText(numero);
  const comparableValues = [
    designation,
    pickFirstString(item, ['forfait']),
    pickFirstString(item, ['materiel']),
    pickFirstString(item, ['libelle']),
  ]
    .filter((value): value is string => !!value)
    .map((value) => normalizeText(value));

  if (comparableValues.includes(normalizedNumero)) return '';

  const lineType = normalizeText(inferSaLineType(item, arrayKey) ?? '');
  if (lineType === 'materiel' && /[a-z]/i.test(numero)) return '';

  return numero;
}

function normalizeSaArrayItem(item: unknown, arrayKey: string): unknown {
  if (!isPlainObject(item)) return item;
  if (!looksLikeSaCommercialRow(item, arrayKey)) return item;

  const designation = pickFirstString(item, ['designation', 'libelle', 'forfait', 'materiel', 'libelle_contrat']) ?? '';
  const numero = sanitizeNumero(pickFirstDefined(item, ['numero_ligne', 'numero']), item, arrayKey, designation);
  const quantite = pickFirstDefined(item, ['quantite']) ?? 1;
  const tarif = pickFirstDefined(item, [
    'tarif',
    'tarif_net_mensuel',
    'tarif_brut_mensuel',
    'loyer_net_mensuel',
    'loyer_brut_mensuel',
    'prix_mensuel_ht',
  ]) ?? '';

  return {
    ...item,
    designation,
    libelle: pickFirstString(item, ['libelle']) ?? designation,
    numero,
    numero_ligne: numero,
    quantite,
    prix_mensuel_ht: tarif,
    tarif,
  };
}

function normalizeSaArray(key: string, value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => normalizeSaArrayItem(item, key));
}

function scoreSaArray(value: unknown): number {
  if (!Array.isArray(value)) return -1;
  let score = 0;
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    if (typeof item.designation === 'string' && item.designation.trim()) score += 3;
    if (typeof item.numero === 'string' && item.numero.trim()) score += 2;
    if (typeof item.numero_ligne === 'string' && item.numero_ligne.trim()) score += 2;
    if (item.quantite !== undefined && item.quantite !== null && item.quantite !== '') score += 1;
    if (item.prix_mensuel_ht !== undefined && item.prix_mensuel_ht !== null && item.prix_mensuel_ht !== '') score += 2;
    if (item.tarif !== undefined && item.tarif !== null && item.tarif !== '') score += 1;
  }
  return score;
}

/**
 * Récupère une valeur imbriquée avec un chemin en notation pointée
 * Ex: getNestedValue(obj, 'client.adresse.ville')
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Gérer les index de tableau (ex: "contacts.0.nom")
    if (/^\d+$/.test(part)) {
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(part, 10)];
    } else {
      if (!isPlainObject(current)) return undefined;
      current = current[part];
    }
  }

  return current;
}

export function setNestedValue(obj: UnknownRecord, path: string, value: unknown) {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;

  let current: UnknownRecord = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = current[key];
    if (isPlainObject(next)) {
      current = next;
      continue;
    }
    const created: UnknownRecord = {};
    current[key] = created;
    current = created;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Cherche une valeur dans un objet imbriqué en utilisant différentes stratégies
 * Ex: "contact_nom" peut correspondre à donnees.client.contacts[0].nom ou donnees.contact_nom
 */
export function findValueInData(donnees: UnknownRecord, fieldName: string): unknown {
  // 1. Chercher directement à la racine
  if (donnees[fieldName] !== undefined && donnees[fieldName] !== null) {
    return donnees[fieldName];
  }

  // 2. Chercher avec le chemin tel quel (notation pointée)
  const directPathValue = getNestedValue(donnees, fieldName);
  if (directPathValue !== undefined && directPathValue !== null) {
    return directPathValue;
  }

  // 3. Fallback: underscore -> dot (ex: contact_nom -> client.nom)
  const dotNotation = fieldName.replace(/_/g, '.');
  if (dotNotation !== fieldName) {
    const dotValue = getNestedValue(donnees, dotNotation);
    if (dotValue !== undefined && dotValue !== null) {
      return dotValue;
    }
  }

  // 4. Mapping spécifique pour les champs courants (ordre de priorité important)
  const fieldMappings: Record<string, string[]> = {
    'nom': ['client.nom'],
    'prenom': ['client.prenom'],
    'email': ['client.email'],
    'fonction': ['client.fonction'],
    'mobile': ['client.mobile', 'client.telephone'],
    'fixe': ['client.fixe'],
    'telephone': ['client.telephone', 'client.mobile', 'client.fixe'],

    // Contact client (PAS le fournisseur!)
    'contact_nom': ['client.nom', 'client.contact.nom', 'client.contacts.0.nom'],
    'contact_prenom': ['client.prenom', 'client.contact.prenom', 'client.contacts.0.prenom'],
    'contact_email': ['client.email', 'client.contact.email', 'client.contacts.0.email'],
    'contact_telephone': ['client.telephone', 'client.contact.telephone', 'client.contacts.0.telephone'],
    'contact_mobile': ['client.mobile', 'client.contact.mobile', 'client.contacts.0.mobile', 'client.telephone'],
    'contact_fixe': ['client.fixe', 'client.contact.fixe', 'client.contacts.0.fixe'],
    'contact_fonction': ['client.fonction', 'client.contact.fonction', 'client.contacts.0.fonction'],

    // Client
    'client_nom': ['client.raison_sociale', 'client.nom_commercial', 'client.nom'],
    'raison_sociale': ['client.raison_sociale'],
    'nom_commercial': ['client.nom_commercial'],
    'siren': ['client.siren'],
    'siret': ['client.siret'],
    'adresse': ['client.adresse', 'client.adresse.rue'],
    'adresse_complete': ['client.adresse', 'client.adresse.rue'],
    'code_postal': ['client.code_postal', 'client.adresse.code_postal'],
    'ville': ['client.ville', 'client.adresse.ville'],
    'pays': ['client.pays', 'client.adresse.pays'],
    'ape': ['client.ape'],
    'capital': ['client.capital'],
    'forme_juridique': ['client.forme_juridique'],
    'rcs': ['client.rcs'],

    // Fournisseur / Opérateur (séparé du contact!)
    'operateur_nom': ['fournisseur.nom', 'fournisseur'],
    'fournisseur_nom': ['fournisseur.nom', 'fournisseur'],
    'operateur_adresse': ['fournisseur.adresse'],
    'operateur_siret': ['fournisseur.siret'],
    'code_client': ['fournisseur.code_client'],
    'contact_support': ['fournisseur.contact_support'],

    // Facturation
    'total_ht': ['facturation.total_ht'],
    'total_ttc': ['facturation.total_ttc'],
    'total_tva': ['facturation.total_tva'],
    'numero_facture': ['facturation.numero_facture'],
    'date_facture': ['facturation.date_facture'],
    'date_echeance': ['facturation.date_echeance'],
    'periode_facturee': ['facturation.periode_facturee'],
    'mode_paiement': ['facturation.mode_paiement'],
    'iban': ['facturation.iban'],

    // Totaux par catégorie
    'abonnements_ht': ['facturation.abonnements_ht'],
    'services_ht': ['facturation.services_ht'],
    'reductions_ht': ['facturation.reductions_ht'],
    'consommations_ht': ['facturation.consommations_ht'],

    // Lignes
    'lignes_fixes': ['lignes.fixes'],
    'lignes_mobiles': ['lignes.mobiles'],
    'total_lignes_fixes': ['lignes.total_lignes_fixes'],
    'total_lignes_mobiles': ['lignes.total_lignes_mobiles'],
  };

  const paths = fieldMappings[fieldName];
  if (paths) {
    for (const path of paths) {
      const value = getNestedValue(donnees, path);
      // Vérifier que la valeur existe ET n'est pas un tableau vide
      if (value !== undefined && value !== null &&
          !(Array.isArray(value) && value.length === 0)) {
        return value;
      }
    }
  }

  // NE PAS faire de recherche récursive pour éviter les faux positifs
  // (ex: trouver "nom" du fournisseur au lieu du contact)

  return undefined;
}

/**
 * Expose les tableaux de la situation actuelle (SA) à des clés plates à la racine,
 * afin que les boucles Word à tag plat (ex: {{#lignes}}, {{#abonnements}}) les trouvent.
 *
 * Les données SA extraites imbriquent les tableaux sous `situation_actuelle`
 * (ex: situation_actuelle.lignes). Docxtemplater ne résolvant pas les sections
 * via la notation pointée de façon fiable, on remonte chaque tableau au niveau racine.
 * On préserve aussi les tableaux déjà présents à la racine.
 */
export function buildSaWordData(baseData: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = {};

  const hoistArrays = (obj: unknown) => {
    if (!isPlainObject(obj)) return;
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        const normalized = normalizeSaArray(key, val);
        if (!(key in out) || scoreSaArray(normalized) > scoreSaArray(out[key])) {
          out[key] = normalized;
        }
      }
    }
  };

  // 1. Tableaux à la racine de baseData (prioritaires)
  hoistArrays(baseData);
  // 2. Tableaux imbriqués sous situation_actuelle
  hoistArrays(baseData.situation_actuelle);

  const currentLines = Array.isArray(out.lignes) ? out.lignes : [];
  const fallbackSaLines = buildSituationActuelleLines(baseData, 0).lines.map((line, index) => {
    const existing = isPlainObject(currentLines[index]) ? currentLines[index] : {};
    const numero = line.numero || pickFirstString(existing, ['numero', 'numero_ligne']) || '';
    return {
      designation: line.offre,
      libelle: line.offre,
      numero,
      numero_ligne: numero,
      quantite: line.quantite,
      prix_mensuel_ht: line.prixHt,
      tarif: line.prixHt,
      type: '',
    };
  });
  if (scoreSaArray(fallbackSaLines) >= scoreSaArray(out.lignes)) {
    out.lignes = fallbackSaLines;
  }

  return out;
}

export function formatValueForWord(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  if (Array.isArray(value)) {
    if (value.every((v) => v === null || v === undefined)) return '';
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return value.map((v) => String(v)).join(', ');
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Aplatit un objet imbriqué pour Docxtemplater.
 * Docxtemplater resout {{client.nom}} via la cle plate "client.nom",
 * pas via l'objet imbrique.
 */
export function flattenForDocx(obj: unknown, target: UnknownRecord, prefix = ''): void {
  if (!isPlainObject(obj)) return;
  for (const [key, val] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (
      typeof val === 'string' ||
      typeof val === 'number' ||
      val === null ||
      val === undefined
    ) {
      target[flatKey] = formatValueForWord(val);
    } else if (isPlainObject(val)) {
      flattenForDocx(val, target, flatKey);
    }
  }
}
