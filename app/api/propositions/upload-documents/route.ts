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
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const urls: string[] = [];

    // Upload chaque fichier vers Supabase Storage
    for (const file of files) {
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}-${file.name}`;

      const { data, error } = await supabase.storage
        .from('documents')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('documents').getPublicUrl(fileName);

      urls.push(publicUrl);
    }

    return NextResponse.json({ success: true, urls });
  } catch (error) {
    console.error('Error uploading documents:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
