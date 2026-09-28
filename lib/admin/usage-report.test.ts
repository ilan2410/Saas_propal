import { describe, expect, it } from 'vitest';
import {
  aggregateAdminTests,
  aggregateByOrganization,
  aggregateByProposition,
  latestExtractions,
  sumClientCostUsd,
  type UsageRow,
} from './usage-report';

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    organization_id: 'org-1',
    proposition_id: 'prop-1',
    operation: 'sa_analysis',
    model: 'claude-sonnet-4-6',
    input_tokens: 1000,
    output_tokens: 100,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cost_usd: 0.1,
    created_at: '2026-09-28T10:00:00.000Z',
    ...overrides,
  };
}

describe('aggregateByProposition', () => {
  it('fusionne les deux appels d’une extraction en une seule ligne', () => {
    const result = aggregateByProposition([
      row({ operation: 'sa_analysis', input_tokens: 1000, output_tokens: 100, cost_usd: 0.1 }),
      row({ operation: 'sa_structuring', input_tokens: 500, output_tokens: 50, cost_usd: 0.05 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].propositionId).toBe('prop-1');
    expect(result[0].totals.calls).toBe(2);
    expect(result[0].totals.inputTokens).toBe(1500);
    expect(result[0].totals.outputTokens).toBe(150);
    expect(result[0].totals.costUsd).toBeCloseTo(0.15, 10);
    expect(result[0].totals.hasUnknownPricing).toBe(false);
  });

  it('sépare les propositions et trie du plus cher au moins cher', () => {
    const result = aggregateByProposition([
      row({ proposition_id: 'prop-pas-cher', cost_usd: 0.01 }),
      row({ proposition_id: 'prop-cher', cost_usd: 2 }),
    ]);

    expect(result.map((item) => item.propositionId)).toEqual(['prop-cher', 'prop-pas-cher']);
  });

  it('ignore les appels sans proposition rattachée', () => {
    const result = aggregateByProposition([
      row({ proposition_id: null, operation: 'admin_test' }),
      row({ proposition_id: 'prop-1' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].propositionId).toBe('prop-1');
  });
});

describe('aggregateByOrganization', () => {
  it('sépare les organisations', () => {
    const result = aggregateByOrganization([
      row({ organization_id: 'org-1', cost_usd: 0.2 }),
      row({ organization_id: 'org-2', cost_usd: 0.5 }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.organizationId)).toEqual(['org-2', 'org-1']);
  });

  it('compte les extractions, pas les appels', () => {
    const result = aggregateByOrganization([
      row({ proposition_id: 'prop-1', operation: 'sa_analysis' }),
      row({ proposition_id: 'prop-1', operation: 'sa_structuring' }),
      row({ proposition_id: 'prop-2', operation: 'extraction' }),
    ]);

    expect(result[0].totals.calls).toBe(3);
    expect(result[0].extractions).toBe(2);
  });

  it('marque le total comme partiel si un seul appel a un tarif inconnu', () => {
    const result = aggregateByOrganization([
      row({ cost_usd: 0.2 }),
      row({ cost_usd: null, model: 'claude-modele-inconnu' }),
    ]);

    expect(result[0].totals.costUsd).toBeCloseTo(0.2, 10);
    expect(result[0].totals.hasUnknownPricing).toBe(true);
    expect(result[0].totals.unknownPricingCalls).toBe(1);
  });

  it('exclut les tests admin du coût imputé au client', () => {
    const result = aggregateByOrganization([
      row({ operation: 'extraction', proposition_id: 'prop-1', cost_usd: 0.2 }),
      row({ operation: 'admin_test', proposition_id: null, cost_usd: 5 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].totals.costUsd).toBeCloseTo(0.2, 10);
    expect(result[0].extractions).toBe(1);
  });

  it('garde une organisation sans extraction quand elle est listée par le stockage', () => {
    // Un client qui accumule des fichiers sans produire de proposition ne doit
    // pas disparaître du tableau.
    const result = aggregateByOrganization([], ['org-silencieuse']);

    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe('org-silencieuse');
    expect(result[0].extractions).toBe(0);
    expect(result[0].totals.costUsd).toBe(0);
    expect(result[0].totals.hasUnknownPricing).toBe(false);
  });
});

describe('aggregateAdminTests', () => {
  it('totalise les tests admin et isole la part non rattachée', () => {
    const result = aggregateAdminTests([
      row({ operation: 'admin_test', organization_id: 'org-1', proposition_id: null, cost_usd: 1 }),
      row({ operation: 'admin_test', organization_id: null, proposition_id: null, cost_usd: 2 }),
      row({ operation: 'extraction', cost_usd: 99 }),
    ]);

    expect(result.totals.calls).toBe(2);
    expect(result.totals.costUsd).toBeCloseTo(3, 10);
    expect(result.unattributedCostUsd).toBeCloseTo(2, 10);
  });
});

describe('sumClientCostUsd', () => {
  it('exclut les tests admin du cumul', () => {
    // La carte "cout cumule" et la carte "cout du mois" doivent etre comparables :
    // si l'une exclut les tests admin, l'autre aussi.
    const result = sumClientCostUsd([
      { operation: 'extraction', cost_usd: 12 },
      { operation: 'admin_test', cost_usd: 40 },
    ]);

    expect(result.costUsd).toBeCloseTo(12, 10);
  });

  it('compte les appels au tarif inconnu sans les sommer', () => {
    const result = sumClientCostUsd([
      { operation: 'extraction', cost_usd: 3 },
      { operation: 'extraction', cost_usd: null },
    ]);

    expect(result.costUsd).toBeCloseTo(3, 10);
    expect(result.unknownPricingCalls).toBe(1);
  });
});

describe('latestExtractions', () => {
  it('rend les plus RECENTES, pas les plus cheres', () => {
    // Le tableau s'intitule "Dernieres extractions" : une petite extraction
    // lancee a l'instant doit y figurer avant une grosse d'il y a trois semaines.
    const result = latestExtractions(
      [
        row({ proposition_id: 'ancienne-chere', cost_usd: 50, created_at: '2026-09-01T10:00:00.000Z' }),
        row({ proposition_id: 'recente-petite', cost_usd: 0.1, created_at: '2026-09-28T10:00:00.000Z' }),
      ],
      10,
    );

    expect(result.map((item) => item.propositionId)).toEqual(['recente-petite', 'ancienne-chere']);
  });

  it('tronque a la limite demandee', () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      row({ proposition_id: `prop-${index}`, created_at: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z` }),
    );

    expect(latestExtractions(rows, 50)).toHaveLength(50);
  });
});
