import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { requireVisibleProposition } from '@/lib/propositions/note-access';
import {
  createAttachmentDownloadUrl,
  type AttachmentStorageProvider,
} from '@/lib/propositions/attachment-storage';

/**
 * Sert un PDF en affichage « inline » sous son nom d'origine. Le visualiseur PDF
 * du navigateur titre son en-tête d'après l'URL ou Content-Disposition : avec
 * l'URL signée du stockage il affichait la clé de stockage (uuid-nom.pdf).
 * Réservé aux PDF : les autres types gardent l'aperçu par URL signée.
 */
export async function GET(
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
      .select('original_name, mime_type, storage_provider, storage_bucket, storage_key')
      .eq('id', attachmentId)
      .eq('proposition_id', id)
      .eq('organization_id', ctx.organizationId)
      .single();
    if (error || !attachment) return NextResponse.json({ error: 'Pièce jointe introuvable' }, { status: 404 });
    if (attachment.mime_type !== 'application/pdf') {
      return NextResponse.json({ error: 'Aperçu inline réservé aux PDF' }, { status: 415 });
    }

    const url = await createAttachmentDownloadUrl({
      storage_provider: attachment.storage_provider as AttachmentStorageProvider,
      storage_bucket: attachment.storage_bucket,
      storage_key: attachment.storage_key,
    });
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Fichier indisponible' }, { status: 502 });
    }

    const name = String(attachment.original_name || 'document.pdf');
    const asciiName = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const headers = new Headers({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    });
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    return new NextResponse(upstream.body, { headers });
  } catch (error) {
    const notFound = error instanceof Error && error.message === 'proposition_not_found';
    return NextResponse.json({
      error: notFound ? 'Proposition introuvable' : 'Aperçu impossible',
      details: error instanceof Error ? error.message : undefined,
    }, { status: notFound ? 404 : 500 });
  }
}
