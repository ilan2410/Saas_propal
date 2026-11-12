import { isMissingRelationError } from '@/lib/supabase/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveTemplateEditorContext } from '@/lib/auth/template-editor-context';
import { allowedSecteurs } from '@/lib/auth/org-context';
import { CLIENT_TEMPLATE_COLUMNS } from '@/lib/security/client-data';
import { organizationStoragePath } from '@/lib/security/storage-access';
import { documentConfig, subTemplatesEnabled } from '@/lib/templates/sub-templates';
import { removeSubTemplateFiles } from '@/lib/templates/sub-template-server';
type Params = { params: Promise<{ id: string }> };
async function handle(request: NextRequest, { params }: Params) {
 try {
  const { id } = await params;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const context = await resolveTemplateEditorContext(client, user, request.nextUrl.searchParams.get('organizationId'));
  if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { ctx } = context;
  const service = createServiceClient();
  const { data: parent } = await service.from('proposition_templates').select(CLIENT_TEMPLATE_COLUMNS).eq('id', id).eq('organization_id', ctx.organizationId).in('secteur', allowedSecteurs(ctx)).maybeSingle();
  if (!parent) return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
  if (request.method === 'GET') {
   const { data, error } = await service.from('template_sub_templates').select('*').eq('template_id', id).eq('organization_id', ctx.organizationId).order('created_at').order('id');
   if (error) throw error;
   const { data: pref, error: prefError } = await service.from('template_generation_preferences').select('mode').eq('user_id', user.id).eq('template_id', id).maybeSingle();
   if (prefError) throw prefError;
   return NextResponse.json({ enabled: subTemplatesEnabled(parent.file_config, data?.length ?? 0), sub_templates: data, mode: pref?.mode ?? 'all', parent });
  }
  const body = await request.json();
  if (request.method === 'PATCH' && 'enabled' in body) {
   if (ctx.role !== 'owner' && !ctx.permissions.manage_templates) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Activation invalide' }, { status: 400 });
   const { error } = await service.from('proposition_templates').update({ file_config: { ...parent.file_config, sub_templates_enabled: body.enabled } }).eq('id', id).eq('organization_id', ctx.organizationId);
   if (error) throw error;
   return NextResponse.json({ success: true, enabled: body.enabled });
  }
  if (request.method === 'PATCH') {
   if (body.mode !== 'all' && body.mode !== 'choose') return NextResponse.json({ error: 'Mode invalide' }, { status: 400 });
   const { error } = await service.from('template_generation_preferences').upsert({ user_id: user.id, template_id: id, mode: body.mode });
   if (error) throw error;
   return NextResponse.json({ success: true });
  }
  if (ctx.role !== 'owner' && !ctx.permissions.manage_templates) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const childId = body.id;
  const { data: old } = typeof childId === 'string' ? await service.from('template_sub_templates').select('*').eq('id', childId).eq('template_id', id).eq('organization_id', ctx.organizationId).maybeSingle() : { data: null };
  if (request.method !== 'POST' && !old) return NextResponse.json({ error: 'Sous-template introuvable' }, { status: 404 });
  if (request.method === 'DELETE') {
   const { data: results, error: loadError } = await service.from('proposition_sub_template_results').select('file_url').eq('sub_template_id', childId).eq('organization_id', ctx.organizationId);
   if (loadError) throw loadError;
   const { data: variantResults, error: variantError } = await service.from('proposition_sp_variant_results').select('file_url').eq('sub_template_id', childId).eq('organization_id', ctx.organizationId);
   if (variantError && !isMissingRelationError(variantError)) throw variantError;
   const { error } = await service.from('template_sub_templates').delete().eq('id', childId).eq('template_id', id).eq('organization_id', ctx.organizationId);
   if (error) throw error;
   await removeSubTemplateFiles([old.file_url, ...(results ?? []).map(r => r.file_url), ...(variantResults ?? []).map(r => r.file_url)], ctx.organizationId);
   return NextResponse.json({ success: true });
  }
  if (typeof body.nom !== 'string' || !body.nom.trim() || body.nom.trim().length > 120 || !['word','excel'].includes(body.file_type)
   || typeof body.file_url !== 'string' || !organizationStoragePath(body.file_url, 'templates', ctx.organizationId)
   || typeof body.file_name !== 'string' || !Number.isFinite(body.file_size_mb) || body.file_size_mb < 0) return NextResponse.json({ error: 'Nom ou fichier invalide' }, { status: 400 });
  const values = { nom: body.nom.trim(), file_type: body.file_type, file_url: body.file_url, file_name: body.file_name, file_size_mb: body.file_size_mb, file_config: documentConfig(body.file_config) };
  const query = request.method === 'POST' ? service.from('template_sub_templates').insert({ ...values, template_id: id, organization_id: ctx.organizationId }) : service.from('template_sub_templates').update(values).eq('id', childId).eq('template_id', id).eq('organization_id', ctx.organizationId);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  if (old && old.file_url !== data.file_url) await removeSubTemplateFiles([old.file_url], ctx.organizationId);
  return NextResponse.json({ sub_template: data });
 } catch (error) {
  console.error('Sous-templates', error);
  return NextResponse.json({ error: 'Impossible de traiter les sous-templates.' }, { status: 500 });
 }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
