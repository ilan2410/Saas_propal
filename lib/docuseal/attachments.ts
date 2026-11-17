import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import { deleteAttachmentObject, uploadAttachmentObject } from '@/lib/propositions/attachment-storage';

// Copie du PDF signé et du journal d'audit dans les « Pièces jointes » de la
// proposition. Copie indépendante de l'archive de signature : supprimer la pièce
// jointe ne casse pas le suivi, et inversement.

interface SignedFilesRef {
  id: string;
  organization_id: string;
  proposition_id: string;
  submission_id: number | null;
  document_name: string;
  variant_name: string | null;
  sent_by: string | null;
  signed_document_path: string | null;
  audit_log_path: string | null;
}

const ARCHIVE_BUCKET = 'propositions';

/** Préfixe propre à la signature et au type de fichier (idempotence). */
function attachmentPrefix(ref: SignedFilesRef, kind: 'document' | 'audit'): string {
  return `${ref.organization_id}/${ref.proposition_id}/signature-${ref.submission_id}/${kind === 'audit' ? 'journal-audit' : 'document-signe'}-`;
}

async function attachmentExists(ref: SignedFilesRef, kind: 'document' | 'audit'): Promise<boolean> {
  const { count, error } = await createServiceClient()
    .from('proposition_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ref.organization_id)
    .eq('proposition_id', ref.proposition_id)
    .like('storage_key', `${attachmentPrefix(ref, kind)}%`);
  if (error) throw error;
  return (count ?? 0) > 0;
}

function displayName(ref: SignedFilesRef, kind: 'document' | 'audit'): string {
  const base = ref.document_name.replace(/\.docx$/i, '').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 100) || 'Proposition';
  return kind === 'audit' ? `${base}_journal_audit.pdf` : `${base}_signe.pdf`;
}

/** Ajoute (une seule fois) le PDF signé et le journal d'audit aux pièces jointes. Idempotent. */
export async function attachSignedFiles(ref: SignedFilesRef): Promise<void> {
  if (!ref.submission_id) return;
  const service = createServiceClient();
  const items = [
    { kind: 'document' as const, path: ref.signed_document_path },
    { kind: 'audit' as const, path: ref.audit_log_path },
  ];

  for (const { kind, path } of items) {
    if (!path || (await attachmentExists(ref, kind))) continue;
    const key = `${attachmentPrefix(ref, kind)}${crypto.randomUUID()}.pdf`;

    const { data: file, error: downloadError } = await service.storage.from(ARCHIVE_BUCKET).download(path);
    if (downloadError || !file) throw new Error(`Lecture du document signé impossible : ${downloadError?.message ?? 'introuvable'}`);
    const body = Buffer.from(await file.arrayBuffer());

    const stored = await uploadAttachmentObject({ key, organizationId: ref.organization_id, body, contentType: 'application/pdf' });
    const { error: insertError } = await service.from('proposition_attachments').insert({
      organization_id: ref.organization_id,
      proposition_id: ref.proposition_id,
      uploaded_by: ref.sent_by,
      original_name: displayName(ref, kind),
      mime_type: 'application/pdf',
      size_bytes: body.byteLength,
      storage_provider: stored.storage_provider,
      storage_bucket: stored.storage_bucket,
      storage_key: stored.storage_key,
    });
    if (insertError) {
      // Pas de fichier orphelin si l'enregistrement échoue.
      await deleteAttachmentObject(stored).catch(() => undefined);
      throw insertError;
    }
  }
}
