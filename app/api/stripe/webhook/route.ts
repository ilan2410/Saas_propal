import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Créer un client Supabase avec service role key pour bypasser RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400 }
      );
    }

    // Vérifier la signature du webhook
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Gérer l'événement
    switch (event.type) {
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('Checkout session completed:', session.id);

        const metadata = session.metadata;
        if (!metadata) {
          console.error('No metadata in session');
          break;
        }

        // Ce compte Stripe est partagé avec d'autres projets : on ignore tout
        // paiement qui ne vient pas explicitement de Saas Propal.
        if (metadata.source !== 'saas_propal_credits') {
          console.log(`Ignoring checkout session ${session.id}: source is not saas_propal_credits`);
          break;
        }

        // Signed provider data establishes payment, never a caller-derived credit total.
        if (session.payment_status !== 'paid') break;
        const organizationId = metadata.organization_id;
        if (!organizationId || session.client_reference_id !== organizationId
          || session.currency !== 'eur' || !Number.isSafeInteger(session.amount_total)
          || session.amount_total! < 1000 || session.amount_total! > 1000000) {
          throw new Error('Invalid paid checkout session');
        }
        const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
        if (!stripeCustomerId || !paymentIntentId) throw new Error('Missing checkout payment identity');
        // Transaction and organization locks make payment recording + credit atomic.
        // Failure returns 500 so Stripe retries; replay cannot credit a second time.
        const { data: settled, error: creditError } = await supabaseAdmin.rpc('settle_credit_checkout', {
          p_session_id: session.id,
          p_organization_id: organizationId,
          p_amount_cents: session.amount_total,
          p_customer_id: stripeCustomerId,
          p_payment_intent_id: paymentIntentId,
        });
        if (creditError) throw creditError;
        if (settled === false) break;

        // Définit la carte utilisée comme moyen de paiement par défaut du client,
        // pour que l'auto-recharge cible toujours la dernière carte utilisée de
        // façon explicite plutôt que de dépendre de l'ordre de la liste Stripe.
        if (stripeCustomerId && session.payment_intent) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string);
            const paymentMethodId =
              typeof paymentIntent.payment_method === 'string' ? paymentIntent.payment_method : null;

            if (paymentMethodId) {
              await stripe.customers.update(stripeCustomerId, {
                invoice_settings: { default_payment_method: paymentMethodId },
              });
            }
          } catch (defaultPaymentMethodError) {
            console.error('Error setting default payment method:', defaultPaymentMethodError);
          }
        }

        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source !== 'saas_propal_credits') break;
        const { error } = await supabaseAdmin.from('stripe_transactions')
          .update({ statut: 'failed' })
          .eq('stripe_session_id', session.id)
          .eq('statut', 'pending');
        if (error) throw error;
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      {
        error: 'Webhook handler failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
