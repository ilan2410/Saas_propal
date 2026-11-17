import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { archiveDocusealSubmission, DocusealError } from '@/lib/docuseal/client';
import { credentialsFromSettings, loadDocusealSettings } from '@/lib/docuseal/settings';
import { resolveSignatureAccess } from '@/lib/docuseal/proposition-access';
import { isActiveSignature, publicSignature, SIGNATURE_COLUMNS, type PropositionSignatureRow } from '@/lib/docuseal/sync';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE — annule un envoi en cours (archive la soumission chez DocuSeal).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; sigId: string }> }) {
  const { id, sigId } = await params;
  if (!UUID_RE.test(sigId)) return NextResponse.json({ error: 'Signature introuvable' }, { status: 404 });
  const access = await resolveSignatureAccess(id, 'id');
  if (access instanceof NextResponse) return access;
  const { ctx, canSend } = access;
  if (!canSend) return NextResponse.json({ error: "Vous n'avez pas la permission de gérer les signatures." }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('proposition_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('id', sigId)
    .eq('proposition_id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  const row = data as PropositionSignatureRow | null;
  if (!row) return NextResponse.json({ error: 'Signature introuvable' }, { status: 404 });
  if (!isActiveSignature(row.status) && row.status !== 'error') {
    return NextResponse.json({ error: 'Cet envoi ne peut plus être annulé.' }, { status: 409 });
  }

  if (row.submission_id) {
    const settings = await loadDocusealSettings(ctx.organizationId).catch(() => null);
    if (!settings) return NextResponse.json({ error: 'Intégration DocuSeal non configurée : annulez la demande directement dans DocuSeal.' }, { status: 409 });
    try {
      await archiveDocusealSubmission(credentialsFromSettings(settings), row.submission_id);
    } catch (err) {
      // Déjà archivée côté DocuSeal : on peut annuler localement.
      if (!(err instanceof DocusealError && err.code === 'not_found')) {
        return NextResponse.json({ error: err instanceof DocusealError ? err.message : 'Annulation impossible' }, { status: 502 });
      }
    }
  }

  const { data: updated, error: updateError } = await service
    .from('proposition_signatures')
    .update({ status: 'cancelled', last_event_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('organization_id', ctx.organizationId)
    .select(SIGNATURE_COLUMNS)
    .single();
  if (updateError) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });

  return NextResponse.json({ signature: publicSignature(updated as PropositionSignatureRow) });
}
