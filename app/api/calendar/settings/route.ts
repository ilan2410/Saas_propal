import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { calendarSettingsSchema } from '@/lib/calendar/validation';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [{ data: settings }, { data: organization, error: organizationError }] = await Promise.all([
    supabase.from('calendar_user_settings').select('timezone').eq('user_id', user.id).maybeSingle(),
    supabase.from('organizations').select('note_title_template').eq('id', ctx.organizationId).single(),
  ]);
  const templateUnavailable = organizationError?.code === '42703' || organizationError?.code === 'PGRST204';
  if (organizationError && !templateUnavailable) {
    return NextResponse.json({ error: organizationError.message }, { status: 500 });
  }
  return NextResponse.json({
    timezone: settings?.timezone ?? null,
    noteTitleTemplate: organization?.note_title_template ?? '',
    canEditNoteTitleTemplate: ctx.role === 'owner',
    commercialName: `${ctx.displayName.prenom} ${ctx.displayName.nom}`.trim() || 'Utilisateur',
  });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = calendarSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
  if (parsed.data.noteTitleTemplate !== undefined && ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Seul l’administrateur de l’entreprise peut modifier ce modèle' }, { status: 403 });
  }
  if (parsed.data.timezone !== undefined) {
    const { error } = await supabase.from('calendar_user_settings').upsert({ user_id: user.id, timezone: parsed.data.timezone });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const normalizedTemplate = parsed.data.noteTitleTemplate?.trim();
  if (normalizedTemplate !== undefined) {
    const service = createServiceClient();
    const { error } = await service
      .from('organizations')
      .update({ note_title_template: normalizedTemplate })
      .eq('id', ctx.organizationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    timezone: parsed.data.timezone,
    noteTitleTemplate: normalizedTemplate,
  });
}
