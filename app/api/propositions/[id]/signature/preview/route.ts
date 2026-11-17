import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rate-limit';
import { isSignatureAvailable, loadDocusealSettings } from '@/lib/docuseal/settings';
import { resolveSignatureAccess } from '@/lib/docuseal/proposition-access';
import { loadSignatureDocumentContext, renderSignatureDocuments } from '@/lib/docuseal/proposition-documents';
import { previewSignatureLabels } from '@/lib/docuseal/signature-tags';
import { SIGNED_DOCUMENTS_BUCKET } from '@/lib/docuseal/sync';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// Assez long pour que Google Docs Viewer récupère le fichier, comme pour les pièces jointes.
const PREVIEW_URL_TTL_SECONDS = 300;
// Les aperçus plus anciens sont supprimés à chaque nouvel aperçu de l'organisation.
const PREVIEW_RETENTION_MS = 15 * 60 * 1000;

async function purgeOldPreviews(service: ReturnType<typeof createServiceClient>, folder: string) {
  try {
    const { data } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).list(folder, { limit: 100 });
    const cutoff = Date.now() - PREVIEW_RETENTION_MS;
    const stale = (data ?? []).filter((entry) => {
      const ts = Number(entry.name.split('-')[0]);
      return Number.isFinite(ts) && ts < cutoff;
    });
    for (const entry of stale) {
      const { data: files } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).list(`${folder}/${entry.name}`);
      const paths = (files ?? []).map((f) => `${folder}/${entry.name}/${f.name}`);
      if (paths.length) await service.storage.from(SIGNED_DOCUMENTS_BUCKET).remove(paths);
    }
  } catch (error) {
    console.error('Purge des aperçus de signature', error instanceof Error ? error.message : error);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET ?variant=<id>&document=main|<annexId> — URL temporaire du fichier Word exact
// qui partira en signature (variante appliquée), zone de signature rendue lisible.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveSignatureAccess(id);
  if (access instanceof NextResponse) return access;
  const { ctx, proposition: parent, canSend, supabase, userId } = access;
  if (!canSend) return NextResponse.json({ error: "Vous n'avez pas la permission d'envoyer en signature." }, { status: 403 });

  const settings = await loadDocusealSettings(ctx.organizationId).catch(() => null);
  if (!isSignatureAvailable(settings)) return NextResponse.json({ error: 'La signature électronique n’est pas activée pour votre compte.' }, { status: 403 });

  const limit = rateLimit(`docuseal-preview:${ctx.organizationId}`, 60, 10 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Trop d’aperçus, réessayez plus tard.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

  const document = request.nextUrl.searchParams.get('document') ?? 'main';
  if (document !== 'main' && !UUID_RE.test(document)) return NextResponse.json({ error: 'Document invalide' }, { status: 400 });

  try {
    const context = await loadSignatureDocumentContext(supabase, ctx.organizationId, userId, parent, request.nextUrl.searchParams.get('variant'));
    if (context === 'variant_not_found') return NextResponse.json({ error: 'Variante introuvable' }, { status: 404 });
    const { template } = context;
    if (!template || template.file_type !== 'word') return NextResponse.json({ error: 'Seules les propositions Word peuvent être envoyées en signature.' }, { status: 400 });

    const annex = document === 'main' ? null : context.annexes.find((a) => a.id === document);
    if (document !== 'main' && (!annex || annex.file_type !== 'word')) return NextResponse.json({ error: 'Annexe introuvable' }, { status: 404 });

    const { documents, placement } = await renderSignatureDocuments(supabase, ctx, { ...context, template }, annex ? [annex] : [], document);
    const doc = documents[0];
    if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });

    const body = previewSignatureLabels(doc.buffer);

    // Google Docs Viewer (même rendu que les pièces jointes) doit pouvoir lire le
    // fichier : dépôt temporaire + URL signée courte. Les anciens aperçus sont purgés.
    const service = createServiceClient();
    const folder = `${ctx.organizationId}/signature-previews`;
    await purgeOldPreviews(service, folder);
    const safeName = doc.name.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'document.docx';
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}/${safeName}`;
    const { error: uploadError } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).upload(path, body, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
    if (uploadError) throw new Error(`Dépôt de l'aperçu impossible : ${uploadError.message}`);
    const { data: signed, error: signError } = await service.storage.from(SIGNED_DOCUMENTS_BUCKET).createSignedUrl(path, PREVIEW_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) throw new Error('Lien d’aperçu indisponible');

    return NextResponse.json(
      { url: signed.signedUrl, name: doc.name, placement: placement ?? null, expires_in: PREVIEW_URL_TTL_SECONDS },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Aperçu signature', error);
    const message = error instanceof Error && error.message.startsWith('Erreur Docxtemplater') ? error.message : 'Aperçu impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
