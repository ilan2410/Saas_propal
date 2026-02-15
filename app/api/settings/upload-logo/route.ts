import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'La taille du fichier ne doit pas dépasser 2MB' },
        { status: 400 }
      );
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Format de fichier non supporté (PNG, JPG, SVG)' },
        { status: 400 }
      );
    }

    // Déterminer l'extension
    let ext = 'png';
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') ext = 'jpg';
    if (file.type === 'image/svg+xml') ext = 'svg';

    const path = `${user.id}/logo.${ext}`;
    const serviceSupabase = createServiceClient();

    // Upload du fichier
    // On utilise upsert pour écraser l'ancien logo si existant
    const { error: uploadError } = await serviceSupabase
      .storage
      .from('logos')
      .upload(path, file, {
        upsert: true,
        contentType: file.type
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
