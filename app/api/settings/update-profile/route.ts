import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
      nom, 
      email, 
      logo_url, 
      siret, 
      adresse, 
      code_postal, 
      ville 
    } = body;

    // Récupérer l'organisation de l'utilisateur
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', user.id) // En supposant que l'ID de l'organisation est le même que l'ID de l'utilisateur (relation 1:1)
      .single();

    if (orgError || !organization) {
      return NextResponse.json(
        { error: 'Organisation non trouvée' },
        { status: 404 }
      );
    }

    // Vérification de sécurité supplémentaire (bien que la requête précédente filtre déjà par user.id)
    if (organization.id !== user.id) {
      return NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      );
    }

    const updates: Record<string, unknown> = {
      nom,
      logo_url,
      siret,
      adresse,
      code_postal,
      ville,
      updated_at: new Date().toISOString(),
    };

    // Gestion du changement d'email
    if (email && email !== organization.email) {
      // Mettre à jour l'email dans Supabase Auth
      const supabaseAdmin = createServiceClient();
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email: email }
      );

      if (updateAuthError) {
        console.error('Erreur lors de la mise à jour de l\'email Auth:', updateAuthError);
        return NextResponse.json(
          { error: 'Erreur lors de la mise à jour de l\'email: ' + updateAuthError.message },
          { status: 500 }
        );
      }

      // Ajouter l'email aux mises à jour de l'organisation
      updates.email = email;
    }

    // Mettre à jour l'organisation
    // On utilise createServiceClient pour être sûr de pouvoir écrire tous les champs si nécessaire,
    // mais le client normal devrait suffire si les politiques RLS sont correctes.
    // Le prompt suggère d'utiliser createServiceClient pour bypasser RLS si nécessaire.
    const supabaseAdmin = createServiceClient();
    const { data: updatedOrg, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', organization.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du profil' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return NextResponse.json(
      { error: 'Une erreur interne est survenue' },
      { status: 500 }
    );
  }
}
