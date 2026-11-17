import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext, SECTEUR_FORBIDDEN_MESSAGE } from '@/lib/auth/org-context';
import { scopePropositionsQuery, propositionSecteurBlocked } from '@/lib/propositions/visibility';
import { loadSpVariant } from '@/lib/propositions/sp-variant-server';
import { organizationStoragePath, signedOrganizationStorageUrl } from '@/lib/security/storage-access';
import { subTemplatesEnabled } from '@/lib/templates/sub-templates';

export const maxDuration = 300;
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: privateHeaders });

/** Resolve a stored document after authorizing its parent; never proxy a caller URL. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);
    const ctx = await resolveOrgContext(client, user);
    if (!ctx) return jsonError('Unauthorized', 401);
    if (ctx.role !== 'owner' && !ctx.permissions.download_proposition) return jsonError('Téléchargement non autorisé', 403);
    if (await propositionSecteurBlocked(ctx, id)) return jsonError(SECTEUR_FORBIDDEN_MESSAGE, 403);
    const { data: parent, error } = await scopePropositionsQuery(
      client.from('propositions').select('id,template_id,duplicated_template_url,selected_sub_template_ids').eq('id', id), ctx,
    ).maybeSingle();
    if (error) return jsonError('Impossible de charger la proposition. Veuillez réessayer.', 500);
    if (!parent) return jsonError('Proposition introuvable', 404);

    const variantId = request.nextUrl.searchParams.get('variant');
    const variant = variantId ? await loadSpVariant(id, ctx.organizationId, variantId) : null;
    if (request.nextUrl.searchParams.has('variant') && !variant) return jsonError('Variante introuvable', 404);
    let fileUrl: unknown = variant ? variant.duplicated_template_url : parent.duplicated_template_url;
    const annexId = request.nextUrl.searchParams.get('annex');
    if (request.nextUrl.searchParams.has('annex')) {
      if (!annexId) return jsonError('Annexe introuvable', 404);
      const service = createServiceClient();
      const selected = variant ? variant.selected_sub_template_ids : parent.selected_sub_template_ids;
      if (Array.isArray(selected) && !selected.includes(annexId)) return jsonError('Annexe introuvable', 404);
      const { data: child, error: childError } = await service.from('template_sub_templates').select('id')
        .eq('id', annexId).eq('template_id', parent.template_id).eq('organization_id', ctx.organizationId).maybeSingle();
      const { data: template, error: templateError } = await service.from('proposition_templates').select('file_config')
        .eq('id', parent.template_id).eq('organization_id', ctx.organizationId).maybeSingle();
      if (childError || templateError || !child || !template || !subTemplatesEnabled(template.file_config, 1)) return jsonError('Annexe introuvable', 404);
      const { data: result, error: resultError } = await service.from(variant ? 'proposition_sp_variant_results' : 'proposition_sub_template_results')
        .select('file_url,status').eq(variant ? 'variant_id' : 'proposition_id', variant?.id ?? id)
        .eq('sub_template_id', annexId).eq('organization_id', ctx.organizationId).maybeSingle();
      if (resultError || result?.status !== 'success') return jsonError('Annexe introuvable', 404);
      fileUrl = result.file_url;
    }
    if (typeof fileUrl !== 'string' || !fileUrl) return jsonError('Fichier introuvable', 404);
    const key = organizationStoragePath(fileUrl, 'templates', ctx.organizationId);
    if (!key) return jsonError('Fichier inaccessible', 403);
    // Signing with the acting user's client preserves the existing Storage RLS check.
    const signed = await signedOrganizationStorageUrl(client, fileUrl, 'templates', ctx.organizationId);
    if (organizationStoragePath(signed, 'templates', ctx.organizationId) !== key) return jsonError('Fichier inaccessible', 403);
    const upstream = await fetch(signed, {
      cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      return jsonError('Fichier indisponible', upstream.status === 404 ? 404 : 502);
    }
    const filename = (key.split('/').pop() || 'proposition').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_');
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
    const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
    const extension = filename.split('.').pop()?.toLowerCase();
    const contentType = extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : extension === 'pdf' ? 'application/pdf' : 'application/octet-stream';
    return new NextResponse(upstream.body, { headers: {
      ...privateHeaders, 'Content-Type': contentType, 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    } });
  } catch {
    // Do not leak signed URLs, storage errors or bearer tokens in error responses.
    return jsonError('Téléchargement impossible. Veuillez réessayer.', 502);
  }
}
