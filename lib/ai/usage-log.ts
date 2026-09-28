import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { computeCallCostUsd, type ClaudeCallUsage } from '@/lib/ai/claude-pricing';
import type { AiUsageOperation } from '@/lib/admin/usage-report';

/**
 * Enregistre la consommation d'un appel Claude.
 *
 * N'échoue JAMAIS bruyamment : une extraction réussie ne doit pas être perdue
 * parce que la comptabilité n'a pas pu s'écrire. Même choix que
 * `syncSourceDocumentsAsAttachments` dans la route d'extraction.
 */
export async function logAiUsage(input: {
  organizationId: string | null;
  propositionId: string | null;
  userId: string | null;
  operation: AiUsageOperation;
  usage: ClaudeCallUsage;
}): Promise<void> {
  try {
    const service = createServiceClient();
    const { error } = await service.from('ai_usage_events').insert({
      organization_id: input.organizationId,
      proposition_id: input.propositionId,
      user_id: input.userId,
      operation: input.operation,
      model: input.usage.model,
      input_tokens: input.usage.inputTokens,
      output_tokens: input.usage.outputTokens,
      cache_creation_input_tokens: input.usage.cacheCreationInputTokens,
      cache_read_input_tokens: input.usage.cacheReadInputTokens,
      cost_usd: computeCallCostUsd(input.usage),
    });
    if (error) console.error('Enregistrement usage IA impossible:', error);
  } catch (error) {
    console.error('Enregistrement usage IA impossible:', error);
  }
}
