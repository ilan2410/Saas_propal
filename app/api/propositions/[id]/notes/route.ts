import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { propositionNoteInputSchema } from '@/lib/calendar/validation';
import { replaceReminderTargets } from '@/lib/calendar/sync';
import { requireVisibleProposition } from '@/lib/propositions/note-access';
import type { PropositionNote } from '@/lib/calendar/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireVisibleProposition(supabase, id, ctx);
    const { data, error } = await supabase
      .from('proposition_notes')
      .select('*, calendar_event_links(id, connection_id, provider, calendar_id, calendar_name, sync_status, last_error)')
      .eq('proposition_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const authorIds = [...new Set((data ?? []).map((note) => note.author_user_id))];
    const { data: members } = authorIds.length
      ? await supabase.from('organization_members').select('user_id, prenom, nom').in('user_id', authorIds)
      : { data: [] };
    const names = new Map((members ?? []).map((member) => [member.user_id, `${member.prenom ?? ''} ${member.nom ?? ''}`.trim()]));
    if (authorIds.includes(ctx.organizationId)) {
      const { data: organization } = await supabase.from('organizations').select('contact_prenom, contact_nom').eq('id', ctx.organizationId).single();
      names.set(ctx.organizationId, `${organization?.contact_prenom ?? ''} ${organization?.contact_nom ?? ''}`.trim());
    }
    return NextResponse.json({
      notes: (data ?? []).map((note) => ({
        ...note,
        author_name: names.get(note.author_user_id) || 'Utilisateur',
        is_own: note.author_user_id === user.id,
      })),
      canViewAuthors: ctx.role === 'owner',
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'proposition_not_found' ? 404 : 500;
    return NextResponse.json({ error: status === 404 ? 'Proposition introuvable' : 'Erreur lors du chargement' }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = propositionNoteInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
  try {
    await requireVisibleProposition(supabase, id, ctx);
    const value = parsed.data;
    const { data, error } = await supabase.from('proposition_notes').insert({
      organization_id: ctx.organizationId,
      proposition_id: id,
      author_user_id: user.id,
      kind: value.kind,
      title: value.kind === 'reminder' ? value.title : null,
      content: value.content || null,
      starts_at: value.kind === 'reminder' ? value.startsAt : null,
      timezone: value.kind === 'reminder' ? value.timezone : null,
      duration_minutes: value.kind === 'reminder' ? value.durationMinutes : null,
      alert_enabled: value.kind === 'reminder' && value.alertEnabled,
      alert_minutes: value.kind === 'reminder' && value.alertEnabled ? value.alertMinutes : null,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('note_create_failed');
    const note = data as PropositionNote;
    let syncResults: unknown[] = [];
    let syncError: string | null = null;
    if (note.kind === 'reminder' && value.targets.length) {
      try {
        syncResults = await replaceReminderTargets(note, value.targets);
      } catch (error) {
        syncError = error instanceof Error ? error.message : 'calendar_sync_failed';
      }
    }
    return NextResponse.json({ note, syncResults, syncError }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === 'proposition_not_found' ? 404 : 500;
    return NextResponse.json({ error: status === 404 ? 'Proposition introuvable' : 'Erreur lors de la création' }, { status });
  }
}
