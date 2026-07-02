import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomStorageFileName, validateUploadedFile } from '@/lib/security/validate-upload';

// Types réellement supportés en aval : envoyés tels quels à Claude
// (extractDataFromDocuments) comme document PDF ou image.
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

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

    // Valider tous les fichiers AVANT tout upload : on rejette la requête
    // entière si un seul fichier échoue la validation.
    const validations = await Promise.all(files.map((file) => validateUploadedFile(file, ALLOWED_DOCUMENT_MIME_TYPES)));
    const firstInvalid = validations.find((v) => !v.ok);
    if (firstInvalid && !firstInvalid.ok) {
      return NextResponse.json({ error: firstInvalid.error }, { status: 400 });
    }

    const urls: string[] = [];

    // Upload chaque fichier vers Supabase Storage
    for (const validation of validations) {
      if (!validation.ok) continue; // garde de type (déjà vérifié ci-dessus)

      // Nom de stockage généré côté serveur : jamais le nom fourni par le client.
      const fileName = `${user.id}/${randomStorageFileName(validation.extension)}`;

      const { error } = await supabase.storage
        .from('documents')
        .upload(fileName, validation.buffer, {
          contentType: validation.mime,
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
