import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { OrganizationPreferences } from '@/types';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'La taille du fichier ne doit pas dépasser 2MB' }, { status: 400 });
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Format non supporté pour le PDF (PNG, JPG uniquement)' },
        { status: 400 }
      );
    }

    let ext = 'png';
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') ext = 'jpg';

    const path = `${user.id}/sp-logo.${ext}`;
    const serviceSupabase = createServiceClient();

    const { error: uploadError } = await serviceSupabase
      .storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error('Erreur upload sp-logo:', uploadError);
      return NextResponse.json({ error: 'Erreur lors du téléchargement' }, { status: 500 });
    }

    const { data: { publicUrl } } = serviceSupabase.storage.from('logos').getPublicUrl(path);
    const logoUrl = `${publicUrl}?t=${Date.now()}`;

    // Merge dans preferences.sp_customization
    const { data: orgRow } = await serviceSupabase
      .from('organizations')
      .select('preferences')
      .eq('id', user.id)
      .single();

    const currentPrefs = ((orgRow?.preferences as OrganizationPreferences) || {}) as OrganizationPreferences;
    const updatedPrefs: OrganizationPreferences = {
      ...currentPrefs,
      sp_customization: {
        ...(currentPrefs.sp_customization || {}),
        logo_url: logoUrl,
      },
    };

    const { error: updateError } = await serviceSupabase
      .from('organizations')
      .update({ preferences: updatedPrefs, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Erreur update prefs sp-logo:', updateError);
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
    }

    return NextResponse.json({ logo_url: logoUrl });
  } catch (error) {
    console.error('Erreur upload-sp-logo:', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
