import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { validateUploadedFile } from '@/lib/security/validate-upload';

// SVG volontairement exclu : un SVG peut embarquer du JavaScript, ce qui en fait
// un vecteur de XSS stockée si le fichier est un jour ouvert/rendu autrement qu'en <img>.
const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg'];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

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

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    const validation = await validateUploadedFile(file, ALLOWED_LOGO_MIME_TYPES, MAX_LOGO_SIZE_BYTES);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ext = validation.extension === 'jpeg' ? 'jpg' : validation.extension;
    const path = `${user.id}/logo.${ext}`;
    const serviceSupabase = createServiceClient();

    // Upload du fichier
    // On utilise upsert pour écraser l'ancien logo si existant
    const { error: uploadError } = await serviceSupabase
      .storage
      .from('logos')
      .upload(path, validation.buffer, {
        upsert: true,
        contentType: validation.mime
      });

    if (uploadError) {
      console.error('Erreur upload logo:', uploadError);
      return NextResponse.json(
        { error: 'Erreur lors du téléchargement du logo' },
        { status: 500 }
      );
    }

    // Récupérer l'URL publique
    const { data: { publicUrl } } = serviceSupabase
      .storage
      .from('logos')
      .getPublicUrl(path);

    // Mettre à jour l'organisation avec la nouvelle URL (et ajouter un timestamp pour forcer le refresh cache navigateur)
    const logoUrlWithTimestamp = `${publicUrl}?t=${new Date().getTime()}`;

    const { error: updateError } = await serviceSupabase
      .from('organizations')
      .update({ 
        logo_url: logoUrlWithTimestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Erreur update organization logo:', updateError);
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du profil' },
        { status: 500 }
      );
    }

    return NextResponse.json({ logo_url: logoUrlWithTimestamp });
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return NextResponse.json(
      { error: 'Une erreur interne est survenue' },
      { status: 500 }
    );
  }
}
