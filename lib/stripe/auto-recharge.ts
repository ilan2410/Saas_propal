import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

// Initialisation Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

// Calcul du bonus (identique à create-checkout-session)
function calculateBonus(montant: number): number {
  if (montant >= 1000) return 20;
  if (montant >= 500) return 15;
  if (montant >= 250) return 10;
  if (montant >= 100) return 5;
  return 0;
}

export async function attemptAutoRecharge(organizationId: string, amount: number) {
  console.log(`[AutoRecharge] Tentative de recharge pour ${organizationId}, montant: ${amount}€`);

  try {
    const supabase = createServiceClient();

    // 1. Récupérer l'organisation et le customer ID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, stripe_customer_id, email, nom')
      .eq('id', organizationId)
      .single();

    if (orgError || !org || !org.stripe_customer_id) {
      console.error('[AutoRecharge] Organisation introuvable ou pas de Stripe ID');
      return { success: false, error: 'No customer ID' };
    }

    // 2. Récupérer les méthodes de paiement du client
    const paymentMethods = await stripe.paymentMethods.list({
      customer: org.stripe_customer_id,
      type: 'card',
    });

    if (paymentMethods.data.length === 0) {
      console.error('[AutoRecharge] Aucune méthode de paiement trouvée');
      return { success: false, error: 'No payment method' };
    }

    // On prend la dernière méthode utilisée ou par défaut
    const customer = await stripe.customers.retrieve(org.stripe_customer_id) as Stripe.Customer;
    let paymentMethodId = customer.invoice_settings.default_payment_method as string;

    if (!paymentMethodId && paymentMethods.data.length > 0) {
      paymentMethodId = paymentMethods.data[0].id;
    }

    if (!paymentMethodId) {
       console.error('[AutoRecharge] Impossible de déterminer la méthode de paiement');
       return { success: false, error: 'No payment method selected' };
    }

    // 3. Calculer les crédits et bonus
    const bonus = calculateBonus(amount);
    const creditsBase = amount;
    const creditsBonus = bonus > 0 ? Math.round(amount * (bonus / 100)) : 0;
    const creditsTotal = creditsBase + creditsBonus;

    // 4. Créer le PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // En centimes
      currency: 'eur',
      customer: org.stripe_customer_id,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        organization_id: organizationId,
        type: 'auto_recharge',
        credits_total: creditsTotal.toString(),
      },
      description: `Recharge automatique de ${creditsTotal}€ de crédits`,
    });

    if (paymentIntent.status === 'succeeded') {
      // 5. Créditer l'organisation
      
      // a. Enregistrer la transaction
      const { error: txError } = await supabase.from('stripe_transactions').insert({
        organization_id: organizationId,
        stripe_payment_intent_id: paymentIntent.id,
        montant: amount,
        credits_ajoutes: creditsTotal,
        statut: 'succeeded',
      });

      if (txError) console.error('[AutoRecharge] Erreur insert transaction:', txError);

      // b. Mettre à jour les crédits via RPC add_credits
      const { error: creditError } = await supabase.rpc('add_credits', {
        org_id: organizationId,
        amount: creditsTotal
      });
      
      if (creditError) {
          console.error('[AutoRecharge] Erreur RPC add_credits:', creditError);
          // Fallback update manuel
          const { data: currentOrg } = await supabase.from('organizations').select('credits').eq('id', organizationId).single();
          if (currentOrg) {
             await supabase.from('organizations').update({ 
                 credits: (currentOrg.credits || 0) + creditsTotal,
                 updated_at: new Date().toISOString()
             }).eq('id', organizationId);
          }
      }

      console.log(`[AutoRecharge] Succès! Ajouté ${creditsTotal} crédits.`);
      return { success: true, creditsAdded: creditsTotal };
    } else {
      console.warn(`[AutoRecharge] Paiement non abouti. Statut: ${paymentIntent.status}`);
      return { success: false, status: paymentIntent.status };
    }

  } catch (error) {
    console.error('[AutoRecharge] Exception:', error);
    return { success: false, error };
  }
}
