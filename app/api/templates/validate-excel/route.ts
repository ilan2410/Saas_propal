import { signedOrganizationStorageUrl } from '@/lib/security/storage-access';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveTemplateEditorContext } from '@/lib/auth/template-editor-context';
import { isAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { validateUploadedFile } from '@/lib/security/validate-upload';
import { fillExcelWorkbook } from '@/lib/generators/excel-workbook';
import { isPlainObject } from '@/lib/generators/data-utils';

/** Validate the actual workbook before saving an Excel mapping (no storage writes). */
export async function POST(request: NextRequest) {
  let supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const form = await request.formData();
    const context = await resolveTemplateEditorContext(supabase, user, form.get('organizationId'));
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { ctx } = context;
    supabase = context.client;
    const rawConfig = form.get('fileConfig');
    const config: unknown = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : null;
    if (!isPlainObject(config)) return NextResponse.json({ error: 'Configuration Excel invalide.' }, { status: 400 });
    let buffer: ArrayBuffer;
    const file = form.get('file');
    if (file instanceof File) {
      const validation = await validateUploadedFile(file, ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
      buffer = Uint8Array.from(validation.buffer).buffer;
    } else {
      const templateId = form.get('templateId');
      if (typeof templateId !== 'string') return NextResponse.json({ error: 'Template manquant.' }, { status: 400 });
      let { data: template } = await supabase.from('proposition_templates').select('file_url, file_type')
        .eq('id', templateId).eq('organization_id', ctx.organizationId).maybeSingle();
      if (template && form.get('subTemplateId')) {
        const { data: child } = await createServiceClient().from('template_sub_templates').select('file_url,file_type').eq('id', String(form.get('subTemplateId'))).eq('template_id', templateId).eq('organization_id', ctx.organizationId).maybeSingle();
        template = child;
      }
      if (!template || template.file_type !== 'excel') return NextResponse.json({ error: 'Template Excel introuvable.' }, { status: 404 });
      if (!template.file_url || !isAllowedFetchUrl(template.file_url)) return NextResponse.json({ error: 'URL du template non autorisée.' }, { status: 400 });
      const response = await fetch(await signedOrganizationStorageUrl(supabase, template.file_url, 'templates', ctx.organizationId), { redirect: 'error' });
      if (!response.ok) return NextResponse.json({ error: 'Impossible de charger le template Excel.' }, { status: 502 });
      buffer = await response.arrayBuffer();
    }
    await fillExcelWorkbook(buffer, {}, {}, config);
    return NextResponse.json({ valid: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Validation Excel impossible.' }, { status: 400 });
  }
}
