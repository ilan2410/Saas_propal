import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTemplateEditorContext } from '@/lib/auth/template-editor-context';
import { previewTemplateDocument } from '@/lib/templates/sub-template-preview';
/** Preview uses the same prepared values and renderer as generated documents, without storing a file. */
export async function POST(request: NextRequest) {
 try {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await request.formData();
  const context = await resolveTemplateEditorContext(client, user, form.get('organizationId'));
  if (!context || !context.ctx.permissions.manage_templates || !context.ctx.permissions.download_proposition) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return await previewTemplateDocument(context.client, context.ctx, form, 'word');
 } catch(error) {
  console.error('Aperçu word', error);
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Aperçu impossible' }, { status: 400 });
 }
}
