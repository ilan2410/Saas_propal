import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isOrganizationStorageKey } from '@/lib/security/storage-access';
import { resolveSignatureAccess } from '@/lib/docuseal/proposition-access';
import { SIGNED_DOCUMENTS_BUCKET } from '@/lib/docuseal/sync';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET ?type=document|audit — redirige vers une URL signée courte du PDF archivé.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; sigId: string }> }) {
  const { id, sigId } = await params;
  if (!UUID_RE.test(sigId)) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
  const access = await resolveSignatureAccess(id, 'id');
  if (access instanceof NextResponse) return access;
  const { ctx } = access;

  const type = request.nextUrl.searchParams.get('type') === 'audit' ? 'audit' : 'document';
  const service = createServiceClient();
  const { data: row } = await service
    .from('proposition_signatures')
    .select('signed_document_path, audit_log_path, document_name')
    .eq('id', sigId)
    .eq('proposition_id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  const path = type === 'audit' ? row?.audit_log_path : row?.signed_document_path;
  if (!path || !isOrganizationStorageKey(path, ctx.organizationId)) {
    return NextResponse.json({ error: 'Document signé pas encore disponible' }, { status: 404 });
  }

  const baseName = String(row?.document_name ?? 'Proposition').replace(/\.docx$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 100) || 'Proposition';
  const fileName = type === 'audit' ? `${baseName}_journal_audit.pdf` : `${baseName}_signe.pdf`;
  const { data, error } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).createSignedUrl(path, 60, { download: fileName });
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'Document indisponible' }, { status: 404 });

  return NextResponse.redirect(data.signedUrl, 302);
}
