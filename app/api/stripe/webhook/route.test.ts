import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: {} as Record<string, unknown>,
}));
vi.mock('stripe', () => ({ default: class {
  webhooks = { constructEvent: () => ({ type: 'checkout.session.completed', data: { object: state.session } }) };
  paymentIntents = { retrieve: async () => ({ payment_method: null }) };
  customers = { update: vi.fn() };
} }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': 'dummy' }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: state.rpc }) }));
import { POST } from './route';

beforeEach(() => {
  state.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  state.session = {
    id: 'cs_dummy', customer: 'cus_dummy', payment_intent: 'pi_dummy',
    client_reference_id: '11111111-1111-1111-1111-111111111111',
    amount_total: 10000, currency: 'eur', payment_status: 'paid',
    metadata: { source: 'saas_propal_credits', organization_id: '11111111-1111-1111-1111-111111111111', credits_total: '1005' },
  };
});
const request = () => new NextRequest('https://app.test/api/stripe/webhook', { method: 'POST', body: '{}' });

describe('checkout settlement boundary', () => {
  it('settles the paid amount, ignoring the client-derived credit metadata', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('settle_credit_checkout', {
      p_session_id: 'cs_dummy', p_organization_id: '11111111-1111-1111-1111-111111111111',
      p_amount_cents: 10000, p_customer_id: 'cus_dummy', p_payment_intent_id: 'pi_dummy',
    });
  });
  it('does not credit an unpaid checkout', async () => {
    state.session.payment_status = 'unpaid';
    expect((await POST(request())).status).toBe(200);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('returns a retryable error if atomic settlement fails', async () => {
    state.rpc.mockResolvedValue({ error: { message: 'dummy unavailable' } });
    expect((await POST(request())).status).toBe(500);
  });
  it('rejects mismatched signed payment identity before settlement', async () => {
    state.session.client_reference_id = 'other';
    expect((await POST(request())).status).toBe(500);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
