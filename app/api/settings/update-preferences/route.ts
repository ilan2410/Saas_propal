import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { OrganizationPreferences } from '@/types';

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
    const newPreferences = body as Partial<OrganizationPreferences>;

    // Récupérer les préférences actuelles
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('preferences')
      .eq('id', user.id)
      .single();

    if (orgError || !organization) {
      return NextResponse.json(
        { error: 'Organisation non trouvée' },
        { status: 404 }
      );
    }

    const currentPreferences = (organization.preferences as OrganizationPreferences) || {};
    
    // Deep merge des préférences
    // Note: Une implémentation simple de merge. 
    // Si on utilisait lodash.merge ce serait plus robuste, mais on fait simple ici.
    // Pour les préférences JSONB, on peut souvent juste merger au premier niveau si la structure est plate,
    // mais ici on a des objets imbriqués (notifications, recharge_auto).
    
    // Approche manuelle pour garantir la structure
    const updatedPreferences: OrganizationPreferences = {
      ...currentPreferences,
      ...newPreferences,
      notifications: {
        ...(currentPreferences.notifications || {}),
        ...(newPreferences.notifications || {})
      },
      recharge_auto: {
        ...(currentPreferences.recharge_auto || {}),
        ...(newPreferences.recharge_auto || {})
      }
    };

    const supabaseAdmin = createServiceClient();
    const { data: updatedOrg, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ 
        preferences: updatedPreferences,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select('preferences')
      .single();

    if (updateError) {
      console.error('Update preferences error:', updateError);
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour des préférences' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ preferences: updatedOrg.preferences });

    if (typeof updatedPreferences.theme === 'string') {
      response.cookies.set('appearance_theme', updatedPreferences.theme, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    if (typeof updatedPreferences.densite === 'string') {
      response.cookies.set('appearance_density', updatedPreferences.densite, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    if (typeof updatedPreferences.page_accueil === 'string') {
      response.cookies.set('appearance_home', updatedPreferences.page_accueil, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return NextResponse.json(
      { error: 'Une erreur interne est survenue' },
      { status: 500 }
    );
  }
}
