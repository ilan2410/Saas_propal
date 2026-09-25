import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { requireVisibleProposition } from '@/lib/propositions/note-access';
import { deleteAttachmentObject, type AttachmentStorageProvider } from '@/lib/propositions/attachment-storage';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requireVisibleProposition(supabase, id, ctx);
    const service = createServiceClient();
    const { data: attachment, error } = await service
      .from('proposition_attachments')
      .select('id, storage_provider, storage_bucket, storage_key')
      .eq('id', attachmentId)
      .eq('proposition_id', id)
      .eq('organization_id', ctx.organizationId)
      .single();
    if (error || !attachment) return NextResponse.json({ error: 'Pièce jointe introuvable' }, { status: 404 });

    await deleteAttachmentObject({
      storage_provider: attachment.storage_provider as AttachmentStorageProvider,
      storage_bucket: attachment.storage_bucket,
      storage_key: attachment.storage_key,
    });
    const { error: deleteError } = await service
      .from('proposition_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('organization_id', ctx.organizationId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true });
  } catch (error) {
    const notFound = error instanceof Error && error.message === 'proposition_not_found';
    return NextResponse.json({
      error: notFound ? 'Proposition introuvable' : 'Suppression de la pièce jointe impossible',
      details: error instanceof Error ? error.message : undefined,
    }, { status: notFound ? 404 : 500 });
  }
}
