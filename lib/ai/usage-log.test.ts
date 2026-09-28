import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeCallUsage } from './claude-pricing';

const inserted: Record<string, unknown>[] = [];
let insertError: { message: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: async (payload: Record<string, unknown>) => {
        inserted.push({ table, ...payload });
        return { error: insertError };
      },
    }),
  }),
}));

const { logAiUsage } = await import('./usage-log');

function usage(overrides: Partial<ClaudeCallUsage> = {}): ClaudeCallUsage {
  return {
    model: 'claude-sonnet-4-6',
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    ...overrides,
  };
}

describe('logAiUsage', () => {
  beforeEach(() => {
    inserted.length = 0;
    insertError = null;
  });

  it('écrit une ligne avec le coût calculé', async () => {
    await logAiUsage({
      organizationId: 'org-1',
      propositionId: 'prop-1',
      userId: 'user-1',
      operation: 'sa_analysis',
      usage: usage(),
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('ai_usage_events');
    expect(inserted[0].organization_id).toBe('org-1');
    expect(inserted[0].operation).toBe('sa_analysis');
    expect(inserted[0].model).toBe('claude-sonnet-4-6');
    expect(inserted[0].input_tokens).toBe(1_000_000);
    expect(Number(inserted[0].cost_usd)).toBeCloseTo(3, 10);
  });

  it('écrit cost_usd null pour un modèle au tarif inconnu', async () => {
    await logAiUsage({
      organizationId: 'org-1',
      propositionId: null,
      userId: null,
      operation: 'extraction',
      usage: usage({ model: 'claude-inconnu' }),
    });

    expect(inserted[0].cost_usd).toBeNull();
  });

  it('n’échoue pas quand l’insertion échoue', async () => {
    insertError = { message: 'permission denied' };

    await expect(
      logAiUsage({
        organizationId: 'org-1',
        propositionId: null,
        userId: null,
        operation: 'extraction',
        usage: usage(),
      }),
    ).resolves.toBeUndefined();
  });
});
