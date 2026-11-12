import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { OrgContext } from '@/lib/auth/org-context';
import { createServiceClient } from '@/lib/supabase/server';
import { signedOrganizationStorageUrl } from '@/lib/security/storage-access';
import { subTemplateConfig } from './sub-templates';
import { preparePropositionGeneration } from '@/lib/generators/prepare-proposition';
import { renderWordProposition } from '@/lib/generators/word-proposition';
import { fillExcelWorkbook } from '@/lib/generators/excel-workbook';
import { buildExcelSourceData, buildPropositionBaseData } from '@/lib/generators/base-data';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { allowedSecteurs } from '@/lib/auth/org-context';
import { CLIENT_TEMPLATE_COLUMNS } from '@/lib/security/client-data';
import { validateUploadedFile } from '@/lib/security/validate-upload';
import { readLimitedResponse } from '@/lib/security/read-limited-response';
export async function previewTemplateDocument(client: SupabaseClient, ctx: OrgContext, form: FormData, type: 'word' | 'excel') {
 const templateId = String(form.get('templateId'));
 const childId = form.get('subTemplateId');
 if (!templateId || templateId === 'null') return NextResponse.json({ error: 'templateId manquant' }, { status: 400 });
 const service = createServiceClient();
 const { data: parent } = await service.from('proposition_templates').select(CLIENT_TEMPLATE_COLUMNS).eq('id', templateId).eq('organization_id', ctx.organizationId).in('secteur', allowedSecteurs(ctx)).maybeSingle();
 if (!parent) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
 const { data: child } = childId && childId !== 'new' ? await service.from('template_sub_templates').select('*').eq('id', String(childId)).eq('template_id', templateId).eq('organization_id', ctx.organizationId).maybeSingle() : { data: null };
 if (childId && childId !== 'new' && !child) return NextResponse.json({ error: 'Sous-template introuvable' }, { status: 404 });
 const source = () => scopePropositionsQuery(client.from('propositions').select('*').eq('template_id', templateId), ctx).order('created_at', { ascending: false }).limit(1);
 const { data: withSp, error: withSpError } = await source().not('suggestions_sp_completes', 'is', null).maybeSingle();
 if (withSpError) throw withSpError;
 const { data: latest, error: latestError } = withSp ? { data: withSp, error: null } : await source().maybeSingle();
 if (latestError) throw latestError;
 if (!latest) return NextResponse.json({ hasData: false });
 const options = await preparePropositionGeneration(client, ctx, latest, parent);
 const draft = form.get('fileConfig');
 const document = childId ? child : parent;
 options.template = { ...options.template, id: document?.id ?? 'new', file_type: type, file_url: document?.file_url ?? '', file_config: subTemplateConfig(parent.file_config, typeof draft === 'string' ? JSON.parse(draft) : document?.file_config) };
 const uploaded = form.get('file');
 let buffer: ArrayBuffer;
 if (uploaded instanceof File) {
  const validation = await validateUploadedFile(uploaded, [type === 'word'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  buffer = Uint8Array.from(validation.buffer).buffer;
 }
 else if (document?.file_url) {
  const response = await fetch(await signedOrganizationStorageUrl(client, document.file_url, 'templates', ctx.organizationId), { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Impossible de charger le sous-template');
  buffer = await readLimitedResponse(response);
 } else return NextResponse.json({ error: 'Choisissez un fichier pour cet aperçu' }, { status: 400 });
 let bytes: Uint8Array;
 if (type === 'word') bytes = await renderWordProposition(buffer, options);
 else {
  const data = buildExcelSourceData(options.donnees, options.suggestions_sp_completes ?? null);
  bytes = await fillExcelWorkbook(buffer, data, buildPropositionBaseData({ ...options, donnees: data }), options.template.file_config as Record<string, unknown>, { createdAt: options.proposition_created_at });
 }
 return new NextResponse(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': type === 'word' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Cache-Control': 'no-store' } });
}
