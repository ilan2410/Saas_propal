import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { OrganizationPreferences } from '@/types';
import { validateUploadedFile } from '@/lib/security/validate-upload';

const ALLOWED_BACKGROUND_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BACKGROUND_SIZE_BYTES = 5 * 1024 * 1024;

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

    const validation = await validateUploadedFile(file, ALLOWED_BACKGROUND_MIME_TYPES, MAX_BACKGROUND_SIZE_BYTES);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ext = validation.extension === 'jpeg' ? 'jpg' : validation.extension;
    const path = `${user.id}/sp-background.${ext}`;
    const serviceSupabase = createServiceClient();

    const { error: uploadError } = await serviceSupabase
      .storage
      .from('logos')
      .upload(path, validation.buffer, { upsert: true, contentType: validation.mime });

    if (uploadError) {
      console.error('Erreur upload sp-background:', uploadError);
      return NextResponse.json({ error: 'Erreur lors du téléchargement' }, { status: 500 });
    }

    const { data: { publicUrl } } = serviceSupabase.storage.from('logos').getPublicUrl(path);
    const bgUrl = `${publicUrl}?t=${Date.now()}`;

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
        questionnaire_bg_url: bgUrl,
      },
    };

    const { error: updateError } = await serviceSupabase
      .from('organizations')
      .update({ preferences: updatedPrefs, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Erreur update prefs sp-background:', updateError);
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
    }

    return NextResponse.json({ bg_url: bgUrl });
  } catch (error) {
    console.error('Erreur upload-sp-background:', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
