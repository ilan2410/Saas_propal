/**
 * Agrégation des lignes `ai_usage_events` pour les écrans admin.
 * Unité pure : elle reçoit des lignes, elle rend des totaux. Aucune requête.
 */

export type AiUsageOperation = 'sa_analysis' | 'sa_structuring' | 'extraction' | 'admin_test';

export type UsageRow = {
  organization_id: string | null;
  proposition_id: string | null;
  operation: AiUsageOperation;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number | null;
  created_at: string;
};

export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Somme des coûts connus. Les appels au tarif inconnu n'y contribuent pas. */
  costUsd: number;
  /** Vrai dès qu'un appel du groupe a un tarif inconnu : le total est partiel. */
  hasUnknownPricing: boolean;
  unknownPricingCalls: number;
};

export type OrgUsageTotals = {
  organizationId: string;
  extractions: number;
  totals: UsageTotals;
};

export type PropositionUsageTotals = {
  propositionId: string;
  organizationId: string | null;
  models: string[];
  lastCallAt: string;
  totals: UsageTotals;
};

export type AdminTestTotals = {
  totals: UsageTotals;
  /** Part des tests lancés sans organisation rattachée (création de client). */
  unattributedCostUsd: number;
};

function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    hasUnknownPricing: false,
    unknownPricingCalls: 0,
  };
}

function addRow(totals: UsageTotals, row: UsageRow): void {
  totals.calls += 1;
  totals.inputTokens += row.input_tokens + row.cache_creation_input_tokens + row.cache_read_input_tokens;
  totals.outputTokens += row.output_tokens;
  if (row.cost_usd === null || !Number.isFinite(Number(row.cost_usd))) {
    totals.hasUnknownPricing = true;
    totals.unknownPricingCalls += 1;
    return;
  }
  totals.costUsd += Number(row.cost_usd);
}

/** Les coûts imputés à un client excluent les tests lancés par l'admin. */
function isClientRow(row: UsageRow): boolean {
  return row.operation !== 'admin_test';
}

export function aggregateByOrganization(
  rows: UsageRow[],
  additionalOrganizationIds: string[] = [],
): OrgUsageTotals[] {
  const groups = new Map<string, { totals: UsageTotals; propositions: Set<string> }>();

  const ensure = (organizationId: string) => {
    const existing = groups.get(organizationId);
    if (existing) return existing;
    const created = { totals: emptyTotals(), propositions: new Set<string>() };
    groups.set(organizationId, created);
    return created;
  };

  for (const organizationId of additionalOrganizationIds) ensure(organizationId);

  for (const row of rows) {
    if (!isClientRow(row) || !row.organization_id) continue;
    const group = ensure(row.organization_id);
    addRow(group.totals, row);
    if (row.proposition_id) group.propositions.add(row.proposition_id);
  }

  return [...groups.entries()]
    .map(([organizationId, group]) => ({
      organizationId,
      extractions: group.propositions.size,
      totals: group.totals,
    }))
    .sort((a, b) => b.totals.costUsd - a.totals.costUsd);
}

export function aggregateByProposition(rows: UsageRow[]): PropositionUsageTotals[] {
  const groups = new Map<string, PropositionUsageTotals & { modelSet: Set<string> }>();

  for (const row of rows) {
    if (!isClientRow(row) || !row.proposition_id) continue;
    let group = groups.get(row.proposition_id);
    if (!group) {
      group = {
        propositionId: row.proposition_id,
        organizationId: row.organization_id,
        models: [],
        lastCallAt: row.created_at,
        totals: emptyTotals(),
        modelSet: new Set<string>(),
      };
      groups.set(row.proposition_id, group);
    }
    addRow(group.totals, row);
    group.modelSet.add(row.model);
    if (row.created_at > group.lastCallAt) group.lastCallAt = row.created_at;
  }

  return [...groups.values()]
    .map(({ modelSet, ...group }) => ({ ...group, models: [...modelSet] }))
    .sort((a, b) => b.totals.costUsd - a.totals.costUsd);
}

/**
 * Cumul du cout imputable aux clients. Exclut les tests admin, comme
 * `aggregateByOrganization`, pour que les deux chiffres restent comparables
 * cote a cote sur le meme ecran.
 */
export function sumClientCostUsd(
  rows: Pick<UsageRow, 'operation' | 'cost_usd'>[],
): { costUsd: number; unknownPricingCalls: number } {
  let costUsd = 0;
  let unknownPricingCalls = 0;

  for (const row of rows) {
    if (row.operation === 'admin_test') continue;
    if (row.cost_usd === null || !Number.isFinite(Number(row.cost_usd))) {
      unknownPricingCalls += 1;
      continue;
    }
    costUsd += Number(row.cost_usd);
  }

  return { costUsd, unknownPricingCalls };
}

/**
 * Les extractions les plus RECENTES. `aggregateByProposition` trie par cout
 * decroissant : s'en servir directement pour un tableau intitule "dernieres
 * extractions" y ferait figurer les plus cheres, pas les dernieres.
 */
export function latestExtractions(rows: UsageRow[], limit: number): PropositionUsageTotals[] {
  return aggregateByProposition(rows)
    .sort((a, b) => b.lastCallAt.localeCompare(a.lastCallAt))
    .slice(0, limit);
}

export function aggregateAdminTests(rows: UsageRow[]): AdminTestTotals {
  const totals = emptyTotals();
  let unattributedCostUsd = 0;

  for (const row of rows) {
    if (row.operation !== 'admin_test') continue;
    addRow(totals, row);
    if (!row.organization_id && row.cost_usd !== null) unattributedCostUsd += Number(row.cost_usd);
  }

  return { totals, unattributedCostUsd };
}
