import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Récupérer le stripe_customer_id de l'organisation
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('stripe_customer_id, email, nom')
      .eq('id', user.id)
      .single();

    if (orgError || !organization) {
      return NextResponse.json(
        { error: 'Organisation non trouvée' },
        { status: 404 }
      );
    }

    let stripeCustomerId = organization.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const email = organization.email || user.email || null;
      if (email) {
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
          const serviceSupabase = createServiceClient();
          await serviceSupabase
            .from('organizations')
            .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        }
      }
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Vous devez d\'abord effectuer un achat avant de pouvoir accéder au portail de gestion' },
        { status: 400 }
      );
    }

    const returnUrl = process.env.NEXT_PUBLIC_URL 
      ? `${process.env.NEXT_PUBLIC_URL}/settings?tab=facturation`
      : `${new URL(request.url).origin}/settings?tab=facturation`;

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Erreur Stripe Customer Portal:', error);
    return NextResponse.json(
      { error: 'Une erreur est survenue lors de la création de la session portail' },
      { status: 500 }
    );
  }
}
