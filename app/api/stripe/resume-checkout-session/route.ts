import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
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

    const body = await request.json();
    const { transactionId } = body as { transactionId?: string };

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId manquant' }, { status: 400 });
    }

    const { data: tx, error: txError } = await supabase
      .from('stripe_transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('organization_id', user.id)
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

    if (!tx.stripe_session_id) {
      return NextResponse.json(
        { error: 'stripe_session_id manquant sur la transaction' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(tx.stripe_session_id);

    if (session.status === 'complete') {
      return NextResponse.json(
        { error: 'La session Stripe est déjà complétée' },
        { status: 400 }
      );
    }

    // Si la session est expirée, on en recrée une nouvelle avec le même montant.
    // (Stripe ne permet pas de "réactiver" une session expirée)
    if (session.status === 'expired') {
      const montant = typeof tx.montant === 'string' ? parseFloat(tx.montant) : Number(tx.montant);

      const response = await fetch(new URL('/api/stripe/create-checkout-session', request.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ montant, organization_id: user.id }),
      });

      const result = await response.json();
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Impossible de recréer la session', details: result.details || result.error },
          { status: 500 }
        );
      }

      return NextResponse.json({ url: result.url });
    }

    if (!session.url) {
      return NextResponse.json({ error: 'URL Stripe manquante' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error resuming checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to resume checkout session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
