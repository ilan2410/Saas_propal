import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import { attachSignedFiles } from './attachments';
import { downloadDocusealFile, getDocusealSubmission, type DocusealCredentials, type DocusealSubmission } from './client';

export type SignatureStatus = 'sending' | 'sent' | 'opened' | 'completed' | 'declined' | 'expired' | 'cancelled' | 'error';

export interface PropositionSignatureRow {
  id: string;
  organization_id: string;
  proposition_id: string;
  submission_id: number | null;
  submitter_id: number | null;
  document_name: string;
  signer_name: string;
  signer_email: string;
  status: SignatureStatus;
  sent_by: string | null;
  sent_at: string;
  opened_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  expire_at: string | null;
  signed_document_path: string | null;
  audit_log_path: string | null;
  last_event_at: string | null;
  error: string | null;
  variant_id: string | null;
  variant_name: string | null;
  annex_names: string[] | null;
  attachments_added_at: string | null;
}

export const SIGNATURE_COLUMNS =
  'id, organization_id, proposition_id, submission_id, submitter_id, document_name, signer_name, signer_email, status, sent_by, sent_at, opened_at, completed_at, declined_at, expire_at, signed_document_path, audit_log_path, last_event_at, error, variant_id, variant_name, annex_names, attachments_added_at';

export const SIGNED_DOCUMENTS_BUCKET = 'propositions';

/** Statuts définitifs : plus aucune mise à jour depuis DocuSeal. */
const FINAL_STATUSES: SignatureStatus[] = ['completed', 'declined', 'expired', 'cancelled'];

export function isActiveSignature(status: SignatureStatus): boolean {
  return status === 'sending' || status === 'sent' || status === 'opened';
}

/** Déduit notre statut à partir de la soumission DocuSeal (un seul signataire). */
export function deriveSignatureStatus(submission: DocusealSubmission, submitterId: number | null, now = new Date()): {
  status: SignatureStatus;
  opened_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
} {
  const submitter = submission.submitters.find((s) => s.id === submitterId) ?? submission.submitters[0];
  const opened_at = submitter?.opened_at ?? null;
  const completed_at = submitter?.completed_at ?? submission.completed_at ?? null;
  const declined_at = submitter?.declined_at ?? null;
  let status: SignatureStatus = 'sent';
  if (completed_at || submission.status === 'completed') status = 'completed';
  else if (declined_at || submission.status === 'declined') status = 'declined';
  else if (submission.archived_at) status = 'cancelled';
  else if (submission.status === 'expired' || (submission.expire_at && new Date(submission.expire_at) <= now)) status = 'expired';
  else if (opened_at || submitter?.status === 'opened') status = 'opened';
  return { status, opened_at, completed_at, declined_at };
}

async function archiveSignedFiles(row: PropositionSignatureRow, submission: DocusealSubmission): Promise<{ signed_document_path: string | null; audit_log_path: string | null }> {
  const service = createServiceClient();
  const base = `${row.organization_id}/signatures/${row.proposition_id}/${submission.id}`;
  const documentUrl = submission.combined_document_url
    ?? submission.documents?.[0]?.url
    ?? submission.submitters.find((s) => s.id === row.submitter_id)?.documents?.[0]?.url
    ?? null;

  let signed_document_path = row.signed_document_path;
  if (!signed_document_path && documentUrl) {
    const pdf = await downloadDocusealFile(documentUrl);
    const path = `${base}.pdf`;
    const { error } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`Archivage du document signé impossible : ${error.message}`);
    signed_document_path = path;
  }

  let audit_log_path = row.audit_log_path;
  if (!audit_log_path && submission.audit_log_url) {
    const pdf = await downloadDocusealFile(submission.audit_log_url);
    const path = `${base}-audit.pdf`;
    const { error } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`Archivage du journal d'audit impossible : ${error.message}`);
    audit_log_path = path;
  }

  return { signed_document_path, audit_log_path };
}

/**
 * Relit la soumission DocuSeal (source de vérité, jamais le payload webhook),
 * met à jour la ligne, archive le PDF signé et passe la proposition en « signée ».
 * Idempotent.
 */
export async function syncSignature(credentials: DocusealCredentials, row: PropositionSignatureRow): Promise<PropositionSignatureRow> {
  if (!row.submission_id) return row;
  // Une ligne terminée et entièrement archivée n'a plus rien à synchroniser chez
  // DocuSeal ; on s'assure seulement que les pièces jointes existent.
  if (row.status === 'completed' && row.signed_document_path && row.audit_log_path) {
    await ensureSignedAttachments(row);
    return row;
  }
  if (FINAL_STATUSES.includes(row.status) && row.status !== 'completed') return row;

  const submission = await getDocusealSubmission(credentials, row.submission_id);
  const derived = deriveSignatureStatus(submission, row.submitter_id);
  // Une annulation locale reste définitive, sauf si DocuSeal indique une signature.
  const status: SignatureStatus = row.status === 'cancelled' && derived.status !== 'completed' ? 'cancelled' : derived.status;

  const update: Partial<PropositionSignatureRow> = {
    status,
    opened_at: derived.opened_at,
    completed_at: derived.completed_at,
    declined_at: derived.declined_at,
    expire_at: submission.expire_at ?? row.expire_at,
    last_event_at: new Date().toISOString(),
    error: null,
  };

  if (status === 'completed') {
    try {
      Object.assign(update, await archiveSignedFiles(row, submission));
    } catch (error) {
      update.error = (error instanceof Error ? error.message : 'Archivage impossible').slice(0, 1000);
    }
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('proposition_signatures')
    .update(update)
    .eq('id', row.id)
    .eq('organization_id', row.organization_id)
    .select(SIGNATURE_COLUMNS)
    .single();
  if (error) throw error;

  if (status === 'completed' && row.status !== 'completed') {
    const { error: propError } = await service
      .from('propositions')
      .update({ statut_commercial: 'signee' })
      .eq('id', row.proposition_id)
      .eq('organization_id', row.organization_id);
    if (propError) console.error('Mise à jour statut commercial (signée) impossible', propError.message);
  }

  const saved = data as PropositionSignatureRow;
  if (saved.status === 'completed') await ensureSignedAttachments(saved);
  return saved;
}

/**
 * Ajoute une seule fois le PDF signé et le journal d'audit aux pièces jointes
 * (sans bloquer le suivi en cas d'échec : nouvelle tentative au prochain passage).
 */
async function ensureSignedAttachments(row: PropositionSignatureRow): Promise<void> {
  if (row.attachments_added_at || !row.signed_document_path || !row.audit_log_path) return;
  try {
    await attachSignedFiles(row);
    const { error } = await createServiceClient()
      .from('proposition_signatures')
      .update({ attachments_added_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('organization_id', row.organization_id);
    if (error) throw error;
  } catch (error) {
    console.error('Ajout du document signé aux pièces jointes', error instanceof Error ? error.message : error);
  }
}

/** Représentation renvoyée au navigateur (sans chemins de stockage internes). */
export function publicSignature(row: PropositionSignatureRow) {
  return {
    id: row.id,
    document_name: row.document_name,
    variant_id: row.variant_id,
    variant_name: row.variant_name,
    annex_names: row.annex_names ?? [],
    signer_name: row.signer_name,
    signer_email: row.signer_email,
    status: row.status,
    sent_at: row.sent_at,
    opened_at: row.opened_at,
    completed_at: row.completed_at,
    declined_at: row.declined_at,
    expire_at: row.expire_at,
    has_signed_document: !!row.signed_document_path,
    has_audit_log: !!row.audit_log_path,
    error: row.error,
  };
}

export type PublicSignature = ReturnType<typeof publicSignature>;
