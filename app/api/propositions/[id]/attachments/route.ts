import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { requireVisibleProposition } from '@/lib/propositions/note-access';
import { safeStorageFileName, validateUploadedFile } from '@/lib/security/validate-upload';
import {
  deleteAttachmentObject,
  uploadAttachmentObject,
  type AttachmentStorageRef,
} from '@/lib/propositions/attachment-storage';

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
const MAX_FILES_PER_REQUEST = 10;
const MAX_BATCH_SIZE_BYTES = 100 * 1024 * 1024;

function publicAttachment(row: Record<string, unknown>) {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requireVisibleProposition(supabase, id, ctx);
    const { data, error } = await supabase
      .from('proposition_attachments')
      .select('id, original_name, mime_type, size_bytes, created_at')
      .eq('proposition_id', id)
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ attachments: (data ?? []).map(publicAttachment) });
  } catch (error) {
    const notFound = error instanceof Error && error.message === 'proposition_not_found';
    return NextResponse.json(
      { error: notFound ? 'Proposition introuvable' : 'Chargement des pièces jointes impossible' },
      { status: notFound ? 404 : 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requireVisibleProposition(supabase, id, ctx);
    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES_PER_REQUEST} fichiers par envoi` }, { status: 400 });
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_SIZE_BYTES) {
      return NextResponse.json({ error: 'La taille totale de l’envoi dépasse 100 Mo' }, { status: 400 });
    }

    const validations = await Promise.all(
      files.map((file) => validateUploadedFile(file, ALLOWED_ATTACHMENT_MIME_TYPES)),
    );
    const invalid = validations.find((validation) => !validation.ok);
    if (invalid && !invalid.ok) return NextResponse.json({ error: invalid.error }, { status: 400 });

    const service = createServiceClient();
    const created: Record<string, unknown>[] = [];
    const stored: AttachmentStorageRef[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const validation = validations[index];
        if (!validation.ok) continue;
        const key = `${ctx.organizationId}/${id}/${safeStorageFileName(files[index].name, validation.extension)}`;
        const storage = await uploadAttachmentObject({
          key,
          body: validation.buffer,
          contentType: validation.mime,
        });
        stored.push(storage);
        const { data, error } = await service.from('proposition_attachments').insert({
          organization_id: ctx.organizationId,
          proposition_id: id,
          uploaded_by: user.id,
          original_name: files[index].name.slice(0, 255),
          mime_type: validation.mime,
          size_bytes: validation.buffer.byteLength,
          ...storage,
        }).select('id, original_name, mime_type, size_bytes, created_at').single();
        if (error || !data) throw error ?? new Error('Enregistrement de la pièce jointe impossible');
        created.push(data);
      }
    } catch (error) {
      await Promise.allSettled(stored.map(deleteAttachmentObject));
      if (created.length) {
        await service.from('proposition_attachments').delete().in('id', created.map((row) => String(row.id)));
      }
      throw error;
    }

    return NextResponse.json({ attachments: created.map(publicAttachment) }, { status: 201 });
  } catch (error) {
    const notFound = error instanceof Error && error.message === 'proposition_not_found';
    return NextResponse.json({
      error: notFound ? 'Proposition introuvable' : 'Envoi des pièces jointes impossible',
      details: error instanceof Error ? error.message : undefined,
    }, { status: notFound ? 404 : 500 });
  }
}
