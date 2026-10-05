import { describe, expect, it } from 'vitest';
import { calculateCanonicalSaAnalysis, type InvoiceAnalysisReport } from './invoice-analysis';

const evidence = [{ document_index: 0, page: 1, text: 'Montant source' }];

function line(id: string, label: string, amount: number, billingMonths = 1, category: 'subscription' | 'discount' = 'subscription') {
  return {
    id,
    label,
    category,
    amount_ht_signed: amount,
    amount_ttc_signed: null,
    vat_rate: null,
    quantity: 1,
    amount_scope: 'line_total' as const,
    recurring: true,
    billing_months: billingMonths,
    source_periodicity: billingMonths === 1 ? 'mensuel' : `${billingMonths} mois`,
    related_line_id: null,
    operator: 'Orange Business Services',
    site: null,
    phone_number: null,
    contract_reference: null,
    evidence,
  };
}

function report(): InvoiceAnalysisReport {
  return {
    summary: 'Total HT mensuel de 301,46 €.',
    declared_monthly_total_ht: 301.46,
    field_coverage: [
      { field: 'client.siret', status: 'found', value_json: '"12345678900012"', evidence, reason: null },
      { field: 'situation_actuelle.abonnements[].libelle', status: 'found', value_json: '["SDA"]', evidence, reason: null },
    ],
    invoices: [
      {
        document_index: 0,
        invoice_number: '306420607',
        supplier: 'Orange',
        account_number: '804742967',
        site: null,
        period_start: '01/06/2026',
        period_end: '30/06/2026',
        billing_months: 1,
        printed_total_ht: 262.81,
        printed_total_ttc: 315.37,
        lines: [
          line('sda', 'Abonnement SDA', 10.01),
          line('ip', 'Accès IP', 274),
          line('voice', 'Forfaits voix', 16),
          line('discount', 'Remises sur abonnement IP', -37.2, 1, 'discount'),
        ],
      },
      {
        document_index: 1,
        invoice_number: '0490390805',
        supplier: 'Orange',
        account_number: '0166365613',
        site: null,
        period_start: '23/06/2026',
        period_end: '22/08/2026',
        billing_months: 2,
        printed_total_ht: 77.3,
        printed_total_ttc: 92.76,
        lines: [line('phone', 'Téléphone Pro', 77.3, 1)],
      },
    ],
  };
}

describe('calculateCanonicalSaAnalysis', () => {
  it('calcule le total HT mensuel client avec remises et facture bimensuelle', () => {
    const result = calculateCanonicalSaAnalysis(
      report(),
      ['client.siret', 'situation_actuelle.abonnements[].libelle'],
    );

    expect(result.invoices[0].monthly_total_ht).toBe(262.81);
    expect(result.invoices[1].monthly_total_ht).toBe(38.65);
    expect(result.total_ht_mensuel_client).toBe(301.46);
    expect(result.issues).toEqual([]);
  });

  it('signale un champ actif omis sans confondre une donnée déclarée absente', () => {
    const value = report();
    value.field_coverage[0].status = 'not_found';
    const result = calculateCanonicalSaAnalysis(value, ['client.siret', 'client.email']);

    expect(result.coverage.not_found).toBe(1);
    expect(result.coverage.missing).toEqual(['client.email']);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing_field_coverage', path: 'client.email' }));
    expect(result.issues).not.toContainEqual(expect.objectContaining({ path: 'client.siret' }));
  });

  it('signale un total mensuel annoncé différent du calcul', () => {
    const value = report();
    value.declared_monthly_total_ht = 387.11;
    const result = calculateCanonicalSaAnalysis(value, value.field_coverage.map((item) => item.field));

    expect(result.total_ht_mensuel_client).toBe(301.46);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'monthly_total_mismatch',
      expected: 301.46,
      actual: 387.11,
    }));
  });

  describe('périodicité des lignes (trimestriel, semestriel, annuel)', () => {
    function periodicReport(annualMonths = 12): InvoiceAnalysisReport {
      return {
        summary: 'Total HT mensuel de 200 €.',
        declared_monthly_total_ht: 200,
        field_coverage: [],
        invoices: [
          {
            document_index: 0,
            invoice_number: 'FA-PERIODIC',
            supplier: 'Orange',
            account_number: null,
            site: null,
            period_start: '01/09/2025',
            period_end: '30/09/2025',
            billing_months: 1,
            printed_total_ht: 910,
            printed_total_ttc: 1092,
            lines: [
              line('abo', 'Abonnement mensuel', 100),
              line('maintenance', 'Maintenance annuelle PABX', 600, annualMonths),
              line('licence', 'Licence semestrielle', 120, 6),
              line('assistance', 'Assistance trimestrielle', 90, 3),
            ],
          },
        ],
      };
    }

    it('divise chaque ligne par son nombre de mois et conserve le montant source', () => {
      const result = calculateCanonicalSaAnalysis(periodicReport(), []);
      const byId = Object.fromEntries(result.invoices[0].lines.map((item) => [item.id, item]));

      expect(byId.maintenance.amount_ht).toBe(600);
      expect(byId.maintenance.monthly_amount_ht).toBe(50);
      expect(byId.licence.monthly_amount_ht).toBe(20);
      expect(byId.assistance.monthly_amount_ht).toBe(30);
      expect(result.total_ht_mensuel_client).toBe(200);
      expect(result.issues).toEqual([]);
    });

    it('signale un total annoncé incohérent quand une ligne annuelle est comptée pour 1 mois', () => {
      const result = calculateCanonicalSaAnalysis(periodicReport(1), []);

      expect(result.total_ht_mensuel_client).toBe(750);
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'monthly_total_mismatch',
        expected: 750,
        actual: 200,
      }));
    });
  });

  describe('rattrapage « ligne = total de la facture »', () => {
    function schedule(userEdited?: boolean): InvoiceAnalysisReport {
      const rent = { ...line('rent', 'Loyer location matériel', 110), ...(userEdited ? { user_edited: true } : {}) };
      return {
        summary: 'Échéancier.',
        declared_monthly_total_ht: 110,
        field_coverage: [],
        invoices: [{
          document_index: 0,
          invoice_number: null,
          supplier: 'Leaser',
          account_number: null,
          site: null,
          period_start: '05/11/2025',
          period_end: '04/11/2028',
          billing_months: 36,
          printed_total_ht: 110,
          printed_total_ttc: 132,
          lines: [rent],
        }],
      };
    }

    it("divise encore la ligne quand l'IA a pris la durée de l'échéancier pour la période", () => {
      const result = calculateCanonicalSaAnalysis(schedule(), []);
      expect(result.invoices[0].lines[0].monthly_amount_ht).toBe(3.06);
    });

    it('respecte la valeur saisie par le client (user_edited) : 110 € sur 1 mois', () => {
      const result = calculateCanonicalSaAnalysis(schedule(true), []);
      expect(result.invoices[0].lines[0].monthly_amount_ht).toBe(110);
      expect(result.total_ht_mensuel_client).toBe(110);
    });
  });

  it('conserve un taux de TVA explicite à zéro', () => {
    const value = report();
    const target = value.invoices[1].lines[0];
    target.amount_ht_signed = null;
    target.amount_ttc_signed = 77.3;
    target.vat_rate = 0;
    const result = calculateCanonicalSaAnalysis(value, value.field_coverage.map((item) => item.field));

    expect(result.invoices[1].monthly_total_ht).toBe(38.65);
    expect(result.total_ht_mensuel_client).toBe(301.46);
  });

  it('traite les appels vers services spéciaux comme une charge variable malgré une catégorie one_time', () => {
    const value = report();
    value.invoices[0].lines.push({
      ...line('special-calls', 'vers services spéciaux (achats ponctuels)', 25.48),
      category: 'one_time',
      recurring: false,
      source_periodicity: 'one_time',
      evidence: [{ document_index: 0, page: 3, text: 'vers services spéciaux 25,48' }],
    });
    value.invoices[0].printed_total_ht = 288.29;
    value.declared_monthly_total_ht = 326.94;

    const included = calculateCanonicalSaAnalysis(value, value.field_coverage.map((item) => item.field), true);
    const excluded = calculateCanonicalSaAnalysis(value, value.field_coverage.map((item) => item.field), false);

    expect(included.invoices[0].lines.at(-1)?.category).toBe('variable');
    expect(included.total_ht_mensuel_client).toBe(326.94);
    expect(included.issues).not.toContainEqual(expect.objectContaining({ code: 'monthly_total_mismatch' }));
    expect(excluded.total_ht_mensuel_client).toBe(301.46);
  });
});
