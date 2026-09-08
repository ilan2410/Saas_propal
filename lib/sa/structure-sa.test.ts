import { describe, expect, it } from 'vitest';
import { calculateSaCartSummary } from '../sp/calculateSaCart';
import { calculateCanonicalSaAnalysis, type InvoiceAnalysisReport } from './invoice-analysis';
import { buildLegacySaData, type StructuredSa } from './structure-sa';

const evidence = [{ document_index: 0, page: 1, text: 'source' }];
const activeFields = ['client.raison_sociale', 'situation_actuelle.abonnements[].libelle'];

const report: InvoiceAnalysisReport = {
  summary: 'Résumé',
  declared_monthly_total_ht: 301.46,
  field_coverage: activeFields.map((field) => ({ field, status: 'found', value_json: field.startsWith('client') ? '"Client test"' : '["Accès IP","Remise"]', evidence, reason: null })),
  invoices: [{
    document_index: 0,
    invoice_number: 'F1',
    supplier: 'Orange',
    account_number: null,
    site: null,
    period_start: null,
    period_end: null,
    billing_months: 1,
    printed_total_ht: 301.46,
    printed_total_ttc: null,
    lines: [
      {
        id: 'charge', label: 'Accès IP', category: 'subscription', amount_ht_signed: 338.66, amount_ttc_signed: null,
        vat_rate: null, quantity: 1, amount_scope: 'line_total', recurring: true, billing_months: 1,
        source_periodicity: 'mensuel', related_line_id: null, operator: 'Orange', site: null, phone_number: null,
        contract_reference: null, evidence,
      },
      {
        id: 'discount', label: 'Remise', category: 'discount', amount_ht_signed: -37.2, amount_ttc_signed: null,
        vat_rate: null, quantity: 1, amount_scope: 'line_total', recurring: true, billing_months: 1,
        source_periodicity: 'mensuel', related_line_id: 'charge', operator: 'Orange', site: null, phone_number: null,
        contract_reference: null, evidence,
      },
    ],
  }],
};

const structured: StructuredSa = {
  mapped_fields: activeFields.map((field) => ({ field, value_json: report.field_coverage.find((item) => item.field === field)?.value_json ?? null })),
  fournisseur: 'Orange',
  client: { nom: null, prenom: null, email: null, fonction: null, mobile: null, fixe: null, raison_sociale: 'Valeur agent 2', adresse: null, code_postal: null, ville: null, siret: null, ape: null, capital: null, forme_juridique: null, rcs: null },
  situation_actuelle: { documents: [], operateurs: [], leasers: [], sites: [], lignes: [], engagements: [] },
  resume: 'Résumé structuré',
};

describe('buildLegacySaData', () => {
  it('protège le total canonique et conserve la remise dans le panier SA', () => {
    const canonical = calculateCanonicalSaAnalysis(report, activeFields);
    const data = buildLegacySaData(structured, report, canonical, true);
    const situation = data.situation_actuelle as Record<string, unknown>;
    const summary = calculateSaCartSummary(data);

    expect(situation.total_ht_mensuel_client).toBe(301.46);
    expect(summary.totalMensuel).toBe(301.46);
    expect(summary.details).toContainEqual(expect.objectContaining({ libelle: 'Remise', montant: -37.2 }));
    expect((data.client as Record<string, unknown>).raison_sociale).toBe('Client test');
  });

  // Régression : une charge hors forfait marquée `recurring: false` par
  // l'IA d'extraction (ex. proposition ETS LOUBET, 19,94€ perdus) doit
  // malgré tout être facturée réellement et comptée dans le total mensuel.
  it("compte une charge variable dans le total même quand l'IA l'a marquée non récurrente", () => {
    const reportWithVariable: InvoiceAnalysisReport = {
      ...report,
      declared_monthly_total_ht: 321.4,
      invoices: [{
        ...report.invoices[0],
        printed_total_ht: 321.4,
        lines: [
          ...report.invoices[0].lines,
          {
            id: 'hors-forfait', label: 'Consommation hors forfait', category: 'variable',
            amount_ht_signed: 19.94, amount_ttc_signed: null, vat_rate: null, quantity: 1,
            amount_scope: 'line_total', recurring: false, billing_months: 1,
            source_periodicity: 'mensuel', related_line_id: null, operator: 'Orange', site: null,
            phone_number: null, contract_reference: null, evidence,
          },
        ],
      }],
    };

    const canonical = calculateCanonicalSaAnalysis(reportWithVariable, activeFields, true);
    const data = buildLegacySaData(structured, reportWithVariable, canonical, true);
    const situation = data.situation_actuelle as Record<string, unknown>;
    const summary = calculateSaCartSummary(data);

    expect(situation.total_ht_mensuel_client).toBe(321.4);
    expect(summary.totalMensuel).toBe(321.4);
    expect(summary.details).toContainEqual(expect.objectContaining({ libelle: 'Consommation hors forfait', montant: 19.94 }));
  });
});
