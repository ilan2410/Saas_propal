import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeStorageFileName, validateUploadedFile } from '@/lib/security/validate-upload';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { SOURCE_DOCUMENTS_BUCKET } from '@/lib/propositions/source-documents';

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

    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const propositionIdRaw = formData.get('proposition_id');
    const propositionId = typeof propositionIdRaw === 'string' && propositionIdRaw.trim()
      ? propositionIdRaw.trim()
      : null;

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Si la proposition est connue, chaque document source est aussi référencé
    // comme pièce jointe (même objet storage, vrai nom de fichier conservé).
    const serviceSupabase = createServiceClient();
    let attachToPropositionId: string | null = null;
    if (propositionId) {
      const { data: proposition } = await serviceSupabase
        .from('propositions')
        .select('id')
        .eq('id', propositionId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      attachToPropositionId = proposition ? proposition.id : null;
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
    for (let i = 0; i < validations.length; i++) {
      const validation = validations[i];
      if (!validation.ok) continue; // garde de type (déjà vérifié ci-dessus)

      // Nom de stockage généré côté serveur : préfixe UUID (unicité + non devinable)
      // suivi du nom d'origine assaini, pour que l'affichage et le téléchargement
      // retrouvent un nom lisible.
      const fileName = `${ctx.organizationId}/${safeStorageFileName(files[i]?.name ?? '', validation.extension)}`;

      const { error } = await supabase.storage
        .from('documents')
        .upload(fileName, validation.buffer, {
          contentType: validation.mime,
          upsert: false,
        });

      if (error) throw error;

      if (attachToPropositionId) {
        const { error: attachmentError } = await serviceSupabase
          .from('proposition_attachments')
          .upsert(
            {
              organization_id: ctx.organizationId,
              proposition_id: attachToPropositionId,
              uploaded_by: user.id,
              original_name: (files[i]?.name ?? 'Document').slice(0, 255),
              mime_type: validation.mime,
              size_bytes: validation.buffer.byteLength,
              storage_provider: 'supabase',
              storage_bucket: SOURCE_DOCUMENTS_BUCKET,
              storage_key: fileName,
            },
            { onConflict: 'storage_provider,storage_bucket,storage_key', ignoreDuplicates: true },
          );
        if (attachmentError) {
          console.error('Erreur création pièce jointe (document source):', attachmentError);
        }
      }

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
