import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { resolveOrgContext } from '@/lib/auth/org-context';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (ctx.role !== 'owner' && !ctx.permissions.view_credits_billing) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { transactionId } = body as { transactionId?: string };

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId manquant' }, { status: 400 });
    }

    const { data: tx, error: txError } = await supabase
      .from('stripe_transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('organization_id', ctx.organizationId)
      .single();

    if (txError || !tx) {
      return NextResponse.json(
        { error: 'Transaction introuvable', details: txError?.message },
        { status: 404 }
      );
    }

    if (tx.statut !== 'pending') {
      return NextResponse.json(
        { error: 'La transaction n\'est pas en attente' },
        { status: 400 }
      );
    }

    if (tx.stripe_session_id) {
      try {
        await stripe.checkout.sessions.expire(tx.stripe_session_id);
      } catch (e) {
        console.warn('Unable to expire Stripe session:', e);
        // A completed or unavailable session must not be reported as canceled.
        const session = await stripe.checkout.sessions.retrieve(tx.stripe_session_id);
        if (session.status !== 'expired') {
          return NextResponse.json({ error: 'Le paiement ne peut plus être annulé' }, { status: 409 });
        }
      }
    }

    const supabaseAdmin = createServiceClient();
    const { data: canceledTx, error: updateError } = await supabaseAdmin
      .from('stripe_transactions')
      .update({ statut: 'canceled' })
      .eq('id', tx.id)
      .eq('organization_id', ctx.organizationId)
      .eq('statut', 'pending')
      .select('id')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: 'Erreur mise à jour transaction', details: updateError.message },
        { status: 500 }
      );
    }
    if (!canceledTx) {
      return NextResponse.json({ error: 'Le statut du paiement a changé' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error canceling checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel checkout session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
