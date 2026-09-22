import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { propositionNoteEntrySchema } from '@/lib/calendar/validation';
import { todayInTimeZone } from '@/lib/calendar/note-description';
import { syncReminder } from '@/lib/calendar/sync';
import { requireEditableNote, requireVisibleProposition } from '@/lib/propositions/note-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = propositionNoteEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
  try {
    await requireVisibleProposition(supabase, id, ctx);
    const note = await requireEditableNote(supabase, noteId, user, ctx);
    if (note.proposition_id !== id || (note.structure_version ?? 1) !== 2) throw new Error('note_not_found');
    const { data: settings } = await supabase.from('calendar_user_settings').select('timezone').eq('user_id', user.id).maybeSingle();
    const timezone = note.timezone || settings?.timezone || 'Europe/Paris';
    const { data, error } = await supabase.from('proposition_note_entries').insert({
      note_id: note.id,
      organization_id: note.organization_id,
      author_user_id: user.id,
      entry_date: todayInTimeZone(timezone),
      content: parsed.data.content,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('entry_create_failed');
    let syncResults: unknown[] = [];
    if (note.kind === 'reminder') syncResults = await syncReminder(note.id);
    const authorName = `${ctx.displayName.prenom} ${ctx.displayName.nom}`.trim() || 'Utilisateur';
    return NextResponse.json({ entry: { ...data, author_name: authorName, can_edit: true, can_delete: true }, syncResults }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.includes('forbidden') ? 403 : message.includes('not_found') ? 404 : 500;
    return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 404 ? 'Note introuvable' : 'Erreur lors de l’ajout' }, { status });
  }
}
