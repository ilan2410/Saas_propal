// Devis d'une extraction AVANT envoi à l'IA : coût estimé en euros, supplément
// éventuel et contrôle du solde. Module pur, sans accès réseau ni base.
import { MODEL_PRICING } from '@/lib/ai/claude-pricing';

/** Coût IA estimé à partir duquel la proposition débite un supplément. */
export const SURCHARGE_THRESHOLD_EUR = 0.75;
/** Supplément débité en plus du tarif de la proposition. */
export const SURCHARGE_EUR = 0.8;

export type ExtractionPipeline = 'extraction' | 'sa';

/** Le supplément ne concerne que ce modèle : ses coûts réels ont servi à calibrer l'estimation. */
export const SURCHARGE_MODEL = 'claude-sonnet-5-5';

type CallAssumption = {
  /** Tokens d'entrée hors documents (prompt, ou rapport de l'étape 1 pour la structuration). */
  fixedInputTokens: number;
  includesDocuments: boolean;
  /** Tokens de sortie (thinking compris) pour un document minimal. */
  baseOutputTokens: number;
  /** Tokens de sortie supplémentaires par token de document (plus de lignes à extraire). */
  outputPerDocumentToken: number;
};

/**
 * Calibré sur 5 extractions réelles de la situation actuelle (2 appels,
 * claude-sonnet-5-5, tableau « Coûts IA » de l'admin) :
 *
 *   tokens totaux  39,4K  40,5K  58,6K  35,7K  33,8K
 *   coût réel      0,17$  0,18$  0,23$  0,14$  0,15$
 *   coût modèle    0,16$  0,16$  0,21$  0,15$  0,14$   (écart max ~0,02$)
 *
 * soit ~11K tokens de sortie au total sur les 2 appels. Pour l'affiner, relire
 * les coûts réels dans `ai_usage_events` et ajuster ces constantes.
 */
const PIPELINE_ASSUMPTIONS: Record<ExtractionPipeline, CallAssumption[]> = {
  sa: [
    // Appel 1, analyse des factures : documents + prompt, sortie proportionnelle au nombre de lignes.
    { fixedInputTokens: 5_000, includesDocuments: true, baseOutputTokens: 5_000, outputPerDocumentToken: 0.08 },
    // Appel 2, structuration : rapport + calculs en entrée, sans les documents.
    { fixedInputTokens: 8_000, includesDocuments: false, baseOutputTokens: 4_000, outputPerDocumentToken: 0 },
  ],
  // Extraction en un appel (hors situation actuelle) : non mesurée, estimation par défaut.
  extraction: [
    { fixedInputTokens: 8_000, includesDocuments: true, baseOutputTokens: 8_000, outputPerDocumentToken: 0.08 },
  ],
};

export interface ExtractionCostEstimate {
  /** `null` hors Sonnet 5.5 : aucun coût n'est inventé pour un modèle non calibré. */
  costUsd: number | null;
  costEur: number | null;
}

export function estimateExtractionCost(input: {
  documentTokens: number;
  model: string;
  pipeline: ExtractionPipeline;
  usdToEurRate: number;
}): ExtractionCostEstimate {
  const pricing = input.model === SURCHARGE_MODEL ? MODEL_PRICING[input.model] : undefined;
  if (!pricing) return { costUsd: null, costEur: null };

  let costUsd = 0;
  for (const call of PIPELINE_ASSUMPTIONS[input.pipeline]) {
    const inputTokens = call.fixedInputTokens + (call.includesDocuments ? input.documentTokens : 0);
    const outputTokens = call.baseOutputTokens + (call.includesDocuments ? call.outputPerDocumentToken * input.documentTokens : 0);
    costUsd += (inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000;
  }
  return { costUsd, costEur: costUsd * input.usdToEurRate };
}

export function surchargeForCost(costEur: number | null): number {
  return costEur !== null && costEur >= SURCHARGE_THRESHOLD_EUR ? SURCHARGE_EUR : 0;
}

/** Arrondi au centime : les crédits sont stockés avec 2 décimales. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DebitPlan {
  tarif: number;
  surcharge: number;
  totalDebit: number;
  credits: number;
  sufficient: boolean;
}

export function planDebit(input: { tarif: number; credits: number; costEur: number | null }): DebitPlan {
  const surcharge = surchargeForCost(input.costEur);
  const totalDebit = roundCents(input.tarif + surcharge);
  return {
    tarif: input.tarif,
    surcharge,
    totalDebit,
    credits: input.credits,
    sufficient: input.credits >= totalDebit,
  };
}
