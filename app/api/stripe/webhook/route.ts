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
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('Checkout session completed:', session.id);

        const metadata = session.metadata;
        if (!metadata) {
          console.error('No metadata in session');
          break;
        }

        const organizationId = metadata.organization_id;
        const creditsTotal = parseFloat(metadata.credits_total);

        // Mettre à jour la transaction
        const { error: updateError } = await supabaseAdmin
          .from('stripe_transactions')
          .update({
            stripe_payment_intent_id: session.payment_intent as string,
            statut: 'succeeded',
          })
          .eq('stripe_session_id', session.id);

        if (updateError) {
          console.error('Error updating transaction:', updateError);
          break;
        }

        // Ajouter les crédits à l'organization
        const { data: org, error: orgError } = await supabaseAdmin
          .from('organizations')
          .select('credits')
          .eq('id', organizationId)
          .single();

        if (orgError) {
          console.error('Error fetching organization:', orgError);
          break;
        }

        const { error: creditError } = await supabaseAdmin
          .from('organizations')
          .update({
            credits: (org.credits || 0) + creditsTotal,
          })
          .eq('id', organizationId);

        if (creditError) {
          console.error('Error updating credits:', creditError);
          break;
        }

        console.log(`Added ${creditsTotal}€ credits to organization ${organizationId}`);
        break;
      }

      case 'checkout.session.expired':
      case 'payment_intent.payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('Payment failed or expired:', session.id);

        // Mettre à jour la transaction
        await supabaseAdmin
          .from('stripe_transactions')
          .update({
            statut: 'failed',
          })
          .eq('stripe_session_id', session.id);

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
