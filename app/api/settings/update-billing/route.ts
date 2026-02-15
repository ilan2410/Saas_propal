import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      nom_facturation, 
      email_facturation,
      telephone_facturation,
      adresse_ligne1_facturation,
      adresse_ligne2_facturation,
      ville_facturation,
      code_postal_facturation,
      pays_facturation
    } = body;

    // Mise à jour en BDD
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .update({
        nom_facturation,
        email_facturation,
        telephone_facturation,
        adresse_ligne1_facturation,
        adresse_ligne2_facturation,
        ville_facturation,
        code_postal_facturation,
        pays_facturation,
        // Fallback pour l'ancien champ
        adresse_facturation: adresse_ligne1_facturation, 
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select('stripe_customer_id, id')
      .single();

    if (orgError) {
      console.error('Erreur DB:', orgError);
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour des infos de facturation' },
        { status: 500 }
      );
    }

    // Synchronisation avec Stripe si un client ID existe
    if (organization && organization.stripe_customer_id) {
      try {
        const stripeCustomerId = organization.stripe_customer_id;
        
        // Update Stripe customer
        const updateParams: Stripe.CustomerUpdateParams = {
          name: nom_facturation,
          email: email_facturation,
          phone: telephone_facturation,
          address: {
            line1: adresse_ligne1_facturation,
            line2: adresse_ligne2_facturation,
            city: ville_facturation,
            postal_code: code_postal_facturation,
            country: pays_facturation, 
          },
        };

        // Nettoyage des champs undefined ou vides pour éviter des erreurs Stripe si nécessaire,
        // mais Stripe accepte null/empty string pour clear.
        // Ici on envoie ce qu'on a.

        await stripe.customers.update(stripeCustomerId, updateParams);

      } catch (stripeError: unknown) {
        console.error('Erreur Stripe:', stripeError);
        // On log l'erreur mais on ne fail pas la requête complète
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return NextResponse.json(
      { error: 'Une erreur interne est survenue' },
      { status: 500 }
    );
  }
}
