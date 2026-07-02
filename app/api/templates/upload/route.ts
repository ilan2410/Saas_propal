import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomStorageFileName, validateUploadedFile } from '@/lib/security/validate-upload';

// Types réellement supportés en aval par les générateurs (lib/generators) :
// Excel (ExcelJS) et Word (Docxtemplater). Le PDF est accepté côté template
// (sélectionnable comme file_type) même si sa génération n'est pas encore
// implémentée, pour rester cohérent avec l'UI existante.
const ALLOWED_TEMPLATE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/pdf',
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
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const validation = await validateUploadedFile(file, ALLOWED_TEMPLATE_MIME_TYPES);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Nom de stockage généré côté serveur : jamais le nom fourni par le client.
    const fileName = `${user.id}/${randomStorageFileName(validation.extension)}`;

    // Upload vers Supabase Storage
    const { error } = await supabase.storage
      .from('templates')
      .upload(fileName, validation.buffer, {
        contentType: validation.mime,
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
