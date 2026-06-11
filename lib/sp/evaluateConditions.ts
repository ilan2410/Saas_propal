import type {
  SpQuestion,
  SpQuestionReponse,
  SpCondition,
  SpGroupeConditions,
  SpConditionLogique,
  SpFiltresCatalogue,
  CatalogueProduit,
  SuggestionsSpCompletes,
} from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/\[]/g, '').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function toComparable(value: unknown): string | number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(',');
  return String(value);
}

function normalizeBooleanString(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (['oui', 'true', 'vrai', '1', 'yes'].includes(normalized)) return 'true';
  if (['non', 'false', 'faux', '0', 'no'].includes(normalized)) return 'false';
  return normalized;
}

function areEquivalentValues(actual: unknown, expected: unknown): boolean {
  const actualComparable = toComparable(actual);
  const expectedComparable = toComparable(expected);

  if (actualComparable == null || expectedComparable == null) return false;

  if (typeof actualComparable === 'number' || typeof expectedComparable === 'number') {
    const actualNum = toNumber(actualComparable);
    const expectedNum = toNumber(expectedComparable);
    if (actualNum != null && expectedNum != null) {
      return actualNum === expectedNum;
    }
  }

  return normalizeBooleanString(String(actualComparable)) === normalizeBooleanString(String(expectedComparable));
}

function toNormalizedTokens(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toNormalizedTokens(item))
      .filter(Boolean);
  }

  const comparable = toComparable(value);
  if (comparable == null) return [];

  const normalized = normalizeBooleanString(String(comparable));
  return normalized
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function containsEquivalentValue(actual: unknown, expected: unknown): boolean {
  const actualTokens = toNormalizedTokens(actual);
  const expectedTokens = toNormalizedTokens(expected);

  if (actualTokens.length === 0 || expectedTokens.length === 0) return false;

  return expectedTokens.some((expectedToken) =>
    actualTokens.some((actualToken) =>
      actualToken === expectedToken || actualToken.includes(expectedToken),
    ),
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function arrayLength(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return 0;
}

function getSelectedCatalogueProducts(
  reponses: SpQuestionReponse[],
  catalogue: CatalogueProduit[],
): CatalogueProduit[] {
  const productById = new Map(catalogue.map((product) => [product.id.trim().toLowerCase(), product]));
  const productByName = new Map(catalogue.map((product) => [product.nom.trim().toLowerCase(), product]));
  const selected = new Map<string, CatalogueProduit>();

  const registerValue = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    const product = productById.get(normalized) ?? productByName.get(normalized);
    if (product) selected.set(product.id, product);
  };

  for (const reponse of reponses) {
    if (
      reponse.question_id.startsWith('prix_') ||
      reponse.question_id.startsWith('fas_') ||
      reponse.question_id.startsWith('quantite_')
    ) {
      continue;
    }

    if (Array.isArray(reponse.valeur)) {
      reponse.valeur.forEach(registerValue);
      continue;
    }

    registerValue(reponse.valeur);
  }

  return Array.from(selected.values());
}

// ── Single condition evaluator ───────────────────────────────────────

function resolveConditionValue(
  condition: SpCondition,
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  suggestionsSpCompletes?: SuggestionsSpCompletes | null,
): unknown {
  switch (condition.source) {
    case 'reponse_question': {
      const rep = reponses.find((r) => r.question_id === condition.question_id);
      return rep?.valeur;
    }
    case 'sa': {
      if (!condition.variable_sa) return undefined;
      const base = getNestedValue(donneesExtraites, condition.variable_sa);
      if (condition.sous_champ_sa && Array.isArray(base)) {
        return base.map((item: Record<string, unknown>) => item?.[condition.sous_champ_sa!]);
      }
      if (condition.sous_champ_sa && typeof base === 'object' && base !== null) {
        return (base as Record<string, unknown>)[condition.sous_champ_sa];
      }
      return base;
    }
    case 'suggestions': {
      if (!condition.variable_sa || !suggestionsSpCompletes) return undefined;
      return suggestionsSpCompletes[condition.variable_sa as keyof SuggestionsSpCompletes];
    }
    case 'catalogue':
      // Catalogue conditions are evaluated separately via filterCatalogue
      return undefined;
    default:
      return undefined;
  }
}

function evaluateSingleCondition(
  condition: SpCondition,
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  catalogue?: CatalogueProduit[],
  suggestionsSpCompletes?: SuggestionsSpCompletes | null,
): boolean {
  // Catalogue conditions are evaluated against the products actually selected
  // in SP answers, not against raw catalogue availability.
  if (condition.source === 'catalogue' && catalogue && condition.filtre_catalogue) {
    const selectedProducts = getSelectedCatalogueProducts(reponses, catalogue);
    const filtered = filterCatalogueByFiltre(selectedProducts, condition.filtre_catalogue);
    const count = filtered.length;
    const target = toNumber(condition.valeur) ?? 0;
    switch (condition.operateur) {
      case 'plus_de_elements': return count > target;
      case 'moins_de_elements': return count < target;
      case 'egal': return count === target;
      case 'different': return count !== target;
      case 'vide': return count === 0;
      case 'non_vide': return count > 0;
      default: return count > 0;
    }
  }

  const actualValue = resolveConditionValue(condition, reponses, donneesExtraites, suggestionsSpCompletes);
  const comparable = toComparable(actualValue);
  const targetStr = condition.valeur != null ? String(condition.valeur) : '';

  switch (condition.operateur) {
    case 'vide':
      return actualValue == null || comparable === '' || comparable === undefined;

    case 'non_vide':
      return actualValue != null && comparable !== '' && comparable !== undefined;

    case 'egal':
      // Pour les réponses multi-choix (tableaux), "egal" vérifie que la valeur est incluse
      if (Array.isArray(actualValue)) return containsEquivalentValue(actualValue, condition.valeur);
      return areEquivalentValues(actualValue, condition.valeur);

    case 'different':
      if (comparable == null) return targetStr !== '';
      if (Array.isArray(actualValue)) return !containsEquivalentValue(actualValue, condition.valeur);
      return !areEquivalentValues(actualValue, condition.valeur);

    case 'contient': {
      return containsEquivalentValue(actualValue, condition.valeur);
    }

    case 'ne_contient_pas': {
      if (comparable == null) return true;
      return !containsEquivalentValue(actualValue, condition.valeur);
    }

    case 'superieur': {
      const numActual = toNumber(actualValue);
      const numTarget = toNumber(condition.valeur);
      if (numActual == null || numTarget == null) return false;
      return numActual > numTarget;
    }

    case 'inferieur': {
      const numActual = toNumber(actualValue);
      const numTarget = toNumber(condition.valeur);
      if (numActual == null || numTarget == null) return false;
      return numActual < numTarget;
    }

    case 'plus_de_elements':
      return arrayLength(actualValue) > (toNumber(condition.valeur) ?? 0);

    case 'moins_de_elements':
      return arrayLength(actualValue) < (toNumber(condition.valeur) ?? 0);

    case 'element_ou': {
      // True if any element of an array matches any of the comma-separated target values
      const targets = targetStr.split(',').map((s) => s.trim().toLowerCase());
      if (Array.isArray(actualValue)) {
        return actualValue.some((v) => targets.includes(String(v).toLowerCase()));
      }
      return targets.includes(String(comparable ?? '').toLowerCase());
    }

    default:
      return true;
  }
}

// ── Group evaluator ──────────────────────────────────────────────────

function evaluateGroup(
  group: SpGroupeConditions,
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  catalogue?: CatalogueProduit[],
  suggestionsSpCompletes?: SuggestionsSpCompletes | null,
): boolean {
  const { conditions, logique_groupe = 'ET' } = group;
  if (!conditions || conditions.length === 0) return true;

  if (logique_groupe === 'OU') {
    return conditions.some((c) =>
      evaluateSingleCondition(c, reponses, donneesExtraites, catalogue, suggestionsSpCompletes),
    );
  }
  // Default: ET
  return conditions.every((c) =>
    evaluateSingleCondition(c, reponses, donneesExtraites, catalogue, suggestionsSpCompletes),
  );
}

// ── Main evaluator ───────────────────────────────────────────────────

/**
 * Evaluate whether a question should be visible based on its conditions.
 * Returns `true` if the question should be shown.
 * Questions without conditions are always visible.
 */
export function evaluateQuestionVisibility(
  question: SpQuestion,
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  catalogue?: CatalogueProduit[],
): boolean {
  const { groupes_conditions, logique_declencheur = 'ET' } = question;

  // No conditions → always visible
  if (!groupes_conditions || groupes_conditions.length === 0) return true;

  if (logique_declencheur === 'OU') {
    return groupes_conditions.some((g) =>
      evaluateGroup(g, reponses, donneesExtraites, catalogue),
    );
  }
  // Default: ET
  return groupes_conditions.every((g) =>
    evaluateGroup(g, reponses, donneesExtraites, catalogue),
  );
}

/**
 * Evaluate a list of SpGroupeConditions with optional access to SuggestionsSpCompletes.
 * Used by the objectifs system to evaluate message and affichage conditions.
 */
export function evaluateGroupes(
  groupes: SpGroupeConditions[],
  logique: 'ET' | 'OU' = 'ET',
  reponses: SpQuestionReponse[],
  donneesExtraites: Record<string, unknown>,
  suggestionsSpCompletes?: SuggestionsSpCompletes | null,
  catalogue?: CatalogueProduit[],
): boolean {
  if (!groupes || groupes.length === 0) return true;

  if (logique === 'OU') {
    return groupes.some((g) =>
      evaluateGroup(g, reponses, donneesExtraites, catalogue, suggestionsSpCompletes),
    );
  }
  return groupes.every((g) =>
    evaluateGroup(g, reponses, donneesExtraites, catalogue, suggestionsSpCompletes),
  );
}

// ── Catalogue filter helper ──────────────────────────────────────────

export function filterCatalogueByFiltre(
  catalogue: CatalogueProduit[],
  filtre: SpFiltresCatalogue,
): CatalogueProduit[] {
  let result = [...catalogue];

  if (filtre.produits_ids && filtre.produits_ids.length > 0) {
    const productRefs = filtre.produits_ids.map((id) => id.trim().toLowerCase());
    return result.filter((p) =>
      productRefs.includes(p.id.toLowerCase()) || productRefs.includes(p.nom.toLowerCase())
    );
  }

  if (filtre.categories && filtre.categories.length > 0) {
    result = result.filter((p) => filtre.categories!.includes(p.categorie));
  }

  if (filtre.fournisseurs && filtre.fournisseurs.length > 0) {
    const fLower = filtre.fournisseurs.map((f) => f.toLowerCase());
    result = result.filter(
      (p) => p.fournisseur && fLower.includes(p.fournisseur.toLowerCase()),
    );
  }

  if (filtre.type_facturation && filtre.type_facturation !== 'tous') {
    result = result.filter((p) => p.type_frequence === filtre.type_facturation);
  }

  return result;
}
