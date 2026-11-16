import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/lib/auth/org-context';
import { clientExtractedData, clientOrganization, clientTemplate, resolveClientConfigPermissions } from './client-data';

const organization = { id: 'org', nom: 'Company', credits: 100, stripe_customer_id: 'cus_secret', prompt_template: 'private', claude_model: 'model', quotas: { tokens: 1000 }, future_secret: 'private', commercial_default_permissions: {}, preferences: { theme: 'dark', recharge_auto: { actif: true } } };
describe('client data projection', () => {
  it('excludes internal and new columns even for an owner', () => {
    const result = clientOrganization(organization, { role: 'owner', permissions: { view_credits_billing: true } } as OrgContext);
    expect(result).toMatchObject({ nom: 'Company', credits: 100 });
    for (const key of ['stripe_customer_id', 'prompt_template', 'claude_model', 'quotas', 'future_secret']) expect(result).not.toHaveProperty(key);
  });
  it('does not serialize billing data for a restricted salesperson', () => {
    const result = clientOrganization(organization, { role: 'commercial', permissions: { view_credits_billing: false } } as OrgContext);
    expect(result).not.toHaveProperty('credits');
    expect(result).not.toHaveProperty('commercial_default_permissions');
    expect(result.preferences).toEqual({ theme: 'dark' });
    expect(organization.preferences.recharge_auto).toEqual({ actif: true });
  });
  it('strips internal AI config and token usage from templates', () => {
    const tpl = clientTemplate({
      id: 't1',
      file_config: { claude_effort: 'high', spEnabled: true },
      test_result: { fieldsExtracted: 5, confidence: 95, tokensUsed: 1234 },
    });
    expect(tpl.file_config).toEqual({ spEnabled: true });
    expect(tpl.test_result).toEqual({ fieldsExtracted: 5, confidence: 95 });
  });
  it('strips multi-agent pipeline internals from extracted_data while keeping review lines', () => {
    const raw = {
      fournisseur: 'Orange',
      situation_actuelle: {
        abonnements: [{ libelle: 'Forfait', preuve_source: [{ text: 'secret' }] }],
      },
      _structured_sa: { mapped_fields: [{ field: 'fournisseur', value_json: '"Orange"' }] },
      _invoice_analysis: {
        summary: 'internal summary',
        declared_monthly_total_ht: 50,
        field_coverage: [{ field: 'fournisseur', status: 'found', value_json: '"Orange"', evidence: [], reason: null }],
        invoices: [{ document_index: 0, lines: [{ id: 'l1', label: 'Forfait', evidence: [{ text: 'quote' }] }] }],
      },
      _extraction_control: {
        status: 'review_required',
        total_ht_mensuel_client: 50,
        coverage: { requested: 10, covered: 9 },
        issues: [
          { code: 'missing_field_coverage', path: 'client.ape', message: 'internal' },
          { code: 'invoice_total_mismatch', path: 'invoices.0.printed_total_ht', message: 'visible' },
        ],
      },
    };
    const sanitized = clientExtractedData(raw);
    expect(sanitized).not.toHaveProperty('_structured_sa');
    expect((sanitized._invoice_analysis as Record<string, unknown>).field_coverage).toEqual([]);
    expect((sanitized._extraction_control as Record<string, unknown>)).not.toHaveProperty('coverage');
    expect((sanitized._extraction_control as { issues: unknown[] }).issues).toEqual([
      { code: 'invoice_total_mismatch', path: 'invoices.0.printed_total_ht', message: 'visible' },
    ]);
    expect(((sanitized.situation_actuelle as Record<string, unknown>).abonnements as Record<string, unknown>[])[0]).not.toHaveProperty('preuve_source');
  });
  it('resolves granular client config permissions with turnkey defaults', () => {
    expect(resolveClientConfigPermissions({})).toMatchObject({
      templates: false,
      sp_questions: false,
      sp_calcul_loyer: false,
    });
    expect(
      resolveClientConfigPermissions({
        client_config_permissions: { templates: true, sp_codes_promo: true },
      }),
    ).toMatchObject({
      templates: true,
      sp_codes_promo: true,
      sp_questions: false,
      sp_calcul_loyer: false,
    });
  });
});
