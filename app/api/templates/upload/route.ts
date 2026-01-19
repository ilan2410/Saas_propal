import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('file_type') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Générer un nom de fichier unique
    const timestamp = Date.now();
    const fileName = `${user.id}/${timestamp}-${file.name}`;

    // Upload vers Supabase Storage
    const { data, error } = await supabase.storage
      .from('templates')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    // Obtenir l'URL publique
    const {
      data: { publicUrl },
    } = supabase.storage.from('templates').getPublicUrl(fileName);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Error uploading template:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload template',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
