import { resolvePropositionClientName } from '@/lib/propositions/clientName';

export type AnalyticsProposition = {
  id: string;
  nom_client: string | null;
  filled_data: unknown;
  extracted_data: unknown;
  source_documents: unknown;
};

export function propositionMetrics(proposition: AnalyticsProposition) {
  const extractedName = resolvePropositionClientName(proposition.extracted_data, proposition.nom_client, '');
  const name = extractedName || resolvePropositionClientName(proposition.filled_data, null, 'Sans nom');
  return {
    name,
    documentCount: Array.isArray(proposition.source_documents) ? proposition.source_documents.length : 0,
  };
}

/** Le tarif courant n'est pas un historique des montants réellement débités. */
export function estimatedProfitEur(
  currentTariff: number | string | null | undefined,
  costUsd: number,
  rate: number,
  hasUnknownPricing: boolean,
): number | null {
  if (currentTariff === null || currentTariff === undefined || hasUnknownPricing) return null;
  const tariff = Number(currentTariff);
  if (!Number.isFinite(tariff) || tariff < 0 || !Number.isFinite(costUsd) || !Number.isFinite(rate)) return null;
  return tariff - costUsd * rate;
}
