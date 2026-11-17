import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';
import { AUTO_BLOCK_NAME_FIELD } from '@/lib/docuseal/signature-tags';
import { createDocxSubmission, DocusealError } from '@/lib/docuseal/client';
import { credentialsFromSettings, isSignatureAvailable, loadDocusealSettings } from '@/lib/docuseal/settings';
import { resolveSignatureAccess, suggestedSigner } from '@/lib/docuseal/proposition-access';
import { loadSignatureDocumentContext, renderSignatureDocuments } from '@/lib/docuseal/proposition-documents';
import {
  isActiveSignature,
  publicSignature,
  SIGNATURE_COLUMNS,
  syncSignature,
  type PropositionSignatureRow,
} from '@/lib/docuseal/sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ANNEXES = 20;

async function listSignatures(organizationId: string, propositionId: string): Promise<PropositionSignatureRow[]> {
  const { data, error } = await createServiceClient()
    .from('proposition_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('proposition_id', propositionId)
    .order('sent_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as PropositionSignatureRow[];
}

// GET ?variant=<id> — disponibilité, annexes proposées et historique des envois.
// `?refresh=1` relit les statuts chez DocuSeal.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveSignatureAccess(id);
  if (access instanceof NextResponse) return access;
  const { ctx, proposition: parent, canSend, supabase, userId } = access;

  try {
    const context = await loadSignatureDocumentContext(supabase, ctx.organizationId, userId, parent, request.nextUrl.searchParams.get('variant'));
    if (context === 'variant_not_found') return NextResponse.json({ error: 'Variante introuvable' }, { status: 404 });

    const settings = await loadDocusealSettings(ctx.organizationId);
    const enabled = isSignatureAvailable(settings);
    let signatures = await listSignatures(ctx.organizationId, id);

    if (request.nextUrl.searchParams.get('refresh') === '1' && settings?.verified_at && signatures.length) {
      const limit = rateLimit(`docuseal-refresh:${ctx.organizationId}:${id}`, 10, 60_000);
      if (limit.allowed) {
        const credentials = credentialsFromSettings(settings);
        signatures = await Promise.all(signatures.map(async (row) => {
          // Signatures en cours, et signées (archivage / pièces jointes à compléter).
          if (!isActiveSignature(row.status) && row.status !== 'completed') return row;
          try {
            return await syncSignature(credentials, row);
          } catch (error) {
            console.error('Actualisation signature', error instanceof Error ? error.message : error);
            return row;
          }
        }));
      }
    }

    const wordTemplate = context.template?.file_type === 'word';
    return NextResponse.json({
      enabled,
      can_send: enabled && canSend && wordTemplate,
      file_type_supported: wordTemplate,
      variant_name: context.variant?.nom ?? null,
      suggested_signer: suggestedSigner(context.proposition),
      annexes: context.annexes.map(({ id: annexId, nom, file_type, selected }) => ({ id: annexId, nom, file_type, selected })),
      statut_commercial: parent.statut_commercial ?? null,
      signatures: signatures.map(publicSignature),
    });
  } catch (error) {
    console.error('Chargement signatures', error);
    return NextResponse.json({ error: 'Impossible de charger les signatures' }, { status: 500 });
  }
}

// POST ?variant=<id> — génère les fichiers Word (proposition avec zone de signature
// + annexes choisies) et les envoie au prospect via DocuSeal.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveSignatureAccess(id);
  if (access instanceof NextResponse) return access;
  const { ctx, proposition: parent, canSend, supabase, userId } = access;

  if (!canSend) return NextResponse.json({ error: "Vous n'avez pas la permission d'envoyer en signature." }, { status: 403 });

  const settings = await loadDocusealSettings(ctx.organizationId).catch(() => null);
  if (!isSignatureAvailable(settings)) {
    return NextResponse.json({ error: 'La signature électronique n’est pas activée pour votre compte.' }, { status: 403 });
  }

  const limit = rateLimit(`docuseal-send:${ctx.organizationId}`, 30, 10 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Trop d’envois, réessayez plus tard.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

  const body = (await request.json().catch(() => null)) as { signer_name?: unknown; signer_email?: unknown; message?: unknown; expire_days?: unknown; annex_ids?: unknown } | null;
  const signerName = typeof body?.signer_name === 'string' ? body.signer_name.trim() : '';
  const signerEmail = typeof body?.signer_email === 'string' ? body.signer_email.trim().toLowerCase() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const expireDays = body?.expire_days === undefined ? 30 : Number(body.expire_days);
  const annexIds = body?.annex_ids === undefined ? [] : body.annex_ids;
  if (signerName.length < 1 || signerName.length > 160) return NextResponse.json({ error: 'Nom du signataire invalide' }, { status: 400 });
  if (!EMAIL_RE.test(signerEmail) || signerEmail.length > 254) return NextResponse.json({ error: 'Email du signataire invalide' }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: 'Message trop long (2000 caractères max.)' }, { status: 400 });
  if (!Number.isInteger(expireDays) || expireDays < 1 || expireDays > 90) return NextResponse.json({ error: 'Durée de validité invalide (1 à 90 jours)' }, { status: 400 });
  if (!Array.isArray(annexIds) || annexIds.length > MAX_ANNEXES || annexIds.some((v) => typeof v !== 'string')) {
    return NextResponse.json({ error: 'Sélection d’annexes invalide' }, { status: 400 });
  }

  const context = await loadSignatureDocumentContext(supabase, ctx.organizationId, userId, parent, request.nextUrl.searchParams.get('variant'));
  if (context === 'variant_not_found') return NextResponse.json({ error: 'Variante introuvable' }, { status: 404 });
  const { variant, template } = context;
  if (!template) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
  if (template.file_type !== 'word') {
    return NextResponse.json({ error: 'Seules les propositions Word peuvent être envoyées en signature.' }, { status: 400 });
  }

  // Annexes demandées : uniquement des annexes Word configurées sur ce template.
  const chosenAnnexes = context.annexes.filter((a) => (annexIds as string[]).includes(a.id));
  if (chosenAnnexes.length !== new Set(annexIds as string[]).size) {
    return NextResponse.json({ error: 'Annexe introuvable pour ce template' }, { status: 400 });
  }
  if (chosenAnnexes.some((a) => a.file_type !== 'word')) {
    return NextResponse.json({ error: 'Seules les annexes Word peuvent être envoyées en signature.' }, { status: 400 });
  }

  const service = createServiceClient();
  const expireAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);

  // La ligne est créée avant l'appel DocuSeal : son id sert d'external_id et
  // l'index unique partiel empêche deux envois simultanés.
  const { data: created, error: insertError } = await service
    .from('proposition_signatures')
    .insert({
      organization_id: ctx.organizationId,
      proposition_id: id,
      document_name: 'Proposition',
      signer_name: signerName,
      signer_email: signerEmail,
      status: 'sending',
      sent_by: userId,
      expire_at: expireAt.toISOString(),
      variant_id: variant?.id ?? null,
      variant_name: variant?.nom ?? null,
      annex_names: chosenAnnexes.map((a) => a.nom),
    })
    .select(SIGNATURE_COLUMNS)
    .single();
  if (insertError || !created) {
    if (insertError?.code === '23505') {
      return NextResponse.json({ error: 'Un envoi en signature est déjà en cours pour cette proposition. Annulez-le avant d’en renvoyer un.' }, { status: 409 });
    }
    console.error('Création signature', insertError);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
  const row = created as PropositionSignatureRow;

  try {
    const { documents: rendered, placement } = await renderSignatureDocuments(supabase, ctx, { ...context, template }, chosenAnnexes);
    const mainName = rendered[0].name;
    const documents = rendered.map((doc) => ({ name: doc.name, docxBase64: Buffer.from(doc.buffer).toString('base64') }));

    const submission = await createDocxSubmission(credentialsFromSettings(settings), {
      name: mainName.replace(/\.docx$/i, ''),
      documents,
      signer: { name: signerName, email: signerEmail, externalId: row.id },
      values: placement === 'auto_block' ? { [AUTO_BLOCK_NAME_FIELD]: signerName } : undefined,
      message: message
        ? { subject: 'Document à signer : {{submission.name}}', body: `${message}\n\n{{submitter.link}}` }
        : undefined,
      expireAt,
    });
    const submitter = submission.submitters?.[0];

    const { data: updated, error: updateError } = await service
      .from('proposition_signatures')
      .update({
        submission_id: submission.id,
        submitter_id: submitter?.id ?? null,
        document_name: mainName.slice(0, 200),
        status: 'sent',
        expire_at: submission.expire_at ?? expireAt.toISOString(),
        last_event_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select(SIGNATURE_COLUMNS)
      .single();
    if (updateError) throw updateError;

    if (parent.statut_commercial !== 'signee') {
      const { error } = await service.from('propositions').update({ statut_commercial: 'en_attente_client' }).eq('id', id).eq('organization_id', ctx.organizationId);
      if (error) console.error('Mise à jour statut commercial (en attente)', error.message);
    }

    return NextResponse.json({ signature: publicSignature(updated as PropositionSignatureRow), placement });
  } catch (error) {
    const messageText = error instanceof DocusealError
      ? error.message
      : error instanceof Error && error.message.startsWith('Erreur Docxtemplater')
        ? error.message
        : 'L’envoi en signature a échoué.';
    if (!(error instanceof DocusealError)) console.error('Envoi signature', error);
    await service.from('proposition_signatures').update({ status: 'error', error: messageText.slice(0, 1000) }).eq('id', row.id);
    return NextResponse.json({ error: messageText }, { status: error instanceof DocusealError ? 502 : 500 });
  }
}
