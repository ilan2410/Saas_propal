import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { inspectDocumentsFromUrls } from '@/lib/ai/claude';
import { DEFAULT_CLAUDE_MODEL, getClaudeMaxOutputTokens, isSaExtractionEligible } from '@/lib/ai/claude-models';
import { checkDocumentLimits, DocumentLimitError } from '@/lib/ai/document-limits';
import { estimateExtractionCost, planDebit, type DebitPlan, type ExtractionPipeline } from '@/lib/ai/extraction-cost';
import { DEFAULT_USD_TO_EUR_RATE, parseUsdToEurRate } from '@/lib/admin/currency';
import { withRequiredTemplateFields } from '@/lib/templates/required-fields';

type Row = Record<string, unknown>;

export interface ExtractionSetup {
  secteurTemplate: string;
  modelToUse: string;
  activeFields: string[];
  useSaPipeline: boolean;
}

/** Modèle, champs et pipeline d'une extraction : source unique pour la route d'extraction et le devis. */
export function resolveExtractionSetup(template: Row, organization: Row): ExtractionSetup {
  const secteurTemplate = (template.secteur as string | null)
    ?? (organization.secteur === 'bureautique' ? 'bureautique' : 'telephonie');
  const modelToUse = (template.claude_model as string | null)
    || (organization.claude_model as string | null)
    || process.env.CLAUDE_MODEL_EXTRACTION
    || DEFAULT_CLAUDE_MODEL;
  const selectedFields = Array.isArray(template.champs_actifs)
    ? template.champs_actifs.filter((field: unknown): field is string => typeof field === 'string')
    : [];
  const activeFields = withRequiredTemplateFields(secteurTemplate, selectedFields);
  return {
    secteurTemplate,
    modelToUse,
    activeFields,
    useSaPipeline: isSaExtractionEligible(secteurTemplate, activeFields),
  };
}

export async function getUsdToEurRate(serviceSupabase: SupabaseClient): Promise<number> {
  const { data } = await serviceSupabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'usd_to_eur_rate')
    .maybeSingle();
  return data ? parseUsdToEurRate(data.value) : DEFAULT_USD_TO_EUR_RATE;
}

export interface ExtractionQuote extends DebitPlan {
  costEur: number | null;
  documentTokens: number;
  totalPages: number;
  totalBytes: number;
}

/**
 * Devis d'une extraction : contrôle des limites Claude, coût estimé en euros,
 * supplément éventuel et suffisance du solde. Lève `DocumentLimitError` si les
 * documents dépassent les limites de l'API.
 */
export async function buildExtractionQuote(input: {
  documentUrls: string[];
  setup: ExtractionSetup;
  tarif: number;
  credits: number;
  usdToEurRate: number;
}): Promise<ExtractionQuote> {
  const { setup } = input;
  const pipeline: ExtractionPipeline = setup.useSaPipeline ? 'sa' : 'extraction';
  const infos = await inspectDocumentsFromUrls(input.documentUrls);
  const limits = setup.useSaPipeline
    ? { maxOutputTokens: getClaudeMaxOutputTokens(setup.modelToUse, 64000), promptTokens: 16000, model: setup.modelToUse }
    : { maxOutputTokens: 16000, model: setup.modelToUse };
  const check = checkDocumentLimits(infos, limits);
  if (!check.ok) throw new DocumentLimitError(check.errors);

  const { costEur } = estimateExtractionCost({
    documentTokens: check.estimatedTokens,
    model: setup.modelToUse,
    pipeline,
    usdToEurRate: input.usdToEurRate,
  });
  return {
    ...planDebit({ tarif: input.tarif, credits: input.credits, costEur }),
    costEur,
    documentTokens: check.estimatedTokens,
    totalPages: check.totalPages,
    totalBytes: check.totalBytes,
  };
}
