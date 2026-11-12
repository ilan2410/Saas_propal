import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { creditPurchase } from '@/lib/stripe/credit-purchase';

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

    const body = await request.json().catch(() => null);
    const purchase = creditPurchase(body?.montant);
    if (!purchase) {
      return NextResponse.json(
        { error: 'Montant invalide (min: 10€, max: 10000€)' },
        { status: 400 }
      );
    }
    const montant = purchase.amount;

    // Déterminer l'URL de base (évite un crash si NEXT_PUBLIC_URL n'est pas défini)
    const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(request.url).origin;

    // Récupérer l'organization (scopée via ctx.organizationId : couvre à la fois le
    // propriétaire, historiquement id === user.id, et un commercial sous-compte).
    const { data: organization, error: orgError } = await createServiceClient().from('organizations')
      .select('id, email, nom, stripe_customer_id')
      .eq('id', ctx.organizationId)
      .single();

    if (orgError || !organization) {
      return NextResponse.json(
        {
          error: 'Organization not found',
          details: orgError?.message || 'Organisation introuvable',
        },
        { status: 404 }
      );
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
    const bonus = purchase.bonusPercent;
    const creditsBase = montant;
    const creditsBonus = purchase.bonus;
    const creditsTotal = purchase.credits;

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
            unit_amount: purchase.cents,
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
        description: `Recharge de crédits – ${creditsBase}€${bonus > 0 ? ` + ${bonus}% bonus (${creditsBonus}€)` : ''} (${creditsTotal}€ de crédits ajoutés)`,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Recharge de crédits – ${creditsBase}€${bonus > 0 ? ` + ${bonus}% bonus (${creditsBonus}€)` : ''} (${creditsTotal}€ de crédits ajoutés)`,
          metadata: {
            source: 'saas_propal_credits',
            organization_id: organization.id,
          },
        },
      },
      metadata: {
        source: 'saas_propal_credits',
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
    const { error: txError } = await createServiceClient().from('stripe_transactions').insert({
      organization_id: ctx.organizationId,
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
