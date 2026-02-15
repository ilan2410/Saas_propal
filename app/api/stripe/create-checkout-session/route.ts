import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

// Calculer le bonus selon le montant
function calculateBonus(montant: number): number {
  if (montant >= 1000) return 20;
  if (montant >= 500) return 15;
  if (montant >= 250) return 10;
  if (montant >= 100) return 5;
  return 0;
}

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
    const { montant } = body;

    if (!montant || montant < 10 || montant > 10000) {
      return NextResponse.json(
        { error: 'Montant invalide (min: 10€, max: 10000€)' },
        { status: 400 }
      );
    }

    // Déterminer l'URL de base (évite un crash si NEXT_PUBLIC_URL n'est pas défini)
    const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(request.url).origin;

    // Récupérer l'organization
    type OrganizationBasic = { id: string; email: string | null; nom: string | null; stripe_customer_id: string | null };
    let organization: OrganizationBasic | null = null;

    const orgById = await supabase
      .from('organizations')
      .select('id, email, nom, stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (orgById.data && !orgById.error) {
      organization = orgById.data as OrganizationBasic;
    } else {
      const orgByEmail = await supabase
        .from('organizations')
        .select('id, email, nom, stripe_customer_id')
        .eq('email', user.email)
        .single();

      if (orgByEmail.data && !orgByEmail.error) {
        organization = orgByEmail.data as OrganizationBasic;
      } else {
        return NextResponse.json(
          {
            error: 'Organization not found',
            details: orgById.error?.message || orgByEmail.error?.message || 'Organisation introuvable',
          },
          { status: 404 }
        );
      }
    }

    let stripeCustomerId = organization.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: organization.email || user.email || undefined,
        name: organization.nom || undefined,
        metadata: {
          organization_id: organization.id,
        },
      });

      stripeCustomerId = customer.id;

      const serviceSupabase = createServiceClient();
      const { error: customerIdUpdateError } = await serviceSupabase
        .from('organizations')
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organization.id);

      if (customerIdUpdateError) {
        return NextResponse.json(
          { error: 'Erreur lors de la sauvegarde du client Stripe', details: customerIdUpdateError.message },
          { status: 500 }
        );
      }
    }

    // Calculer le bonus
    const bonus = calculateBonus(montant);
    const creditsBase = montant;
    const creditsBonus = bonus > 0 ? Math.round(montant * (bonus / 100)) : 0;
    const creditsTotal = creditsBase + creditsBonus;

    // Créer la session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Crédits',
              description: `${creditsBase}€ de crédits${bonus > 0 ? ` + ${bonus}% bonus (${creditsBonus}€)` : ''}`,
            },
            unit_amount: Math.round(montant * 100), // Convertir en centimes
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/credits?success=true`,
      cancel_url: `${baseUrl}/credits?canceled=true`,
      client_reference_id: organization.id,
      payment_intent_data: {
        setup_future_usage: 'off_session',
      },
      metadata: {
        organization_id: organization.id,
        montant: montant.toString(),
        credits_base: creditsBase.toString(),
        credits_bonus: creditsBonus.toString(),
        credits_total: creditsTotal.toString(),
        bonus_applique: bonus.toString(),
      },
      customer: stripeCustomerId,
    });

    // Créer la transaction en BDD (statut: pending)
    const { error: txError } = await supabase.from('stripe_transactions').insert({
      organization_id: user.id,
      stripe_session_id: session.id,
      montant: montant,
      credits_ajoutes: creditsTotal,
      statut: 'pending',
    });

    if (txError) {
      return NextResponse.json(
        { error: 'Erreur création transaction', details: txError.message },
        { status: 500 }
      );
    }

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe session URL manquante' },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
