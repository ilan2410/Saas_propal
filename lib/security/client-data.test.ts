import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/lib/auth/org-context';
import { clientOrganization } from './client-data';

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
});
