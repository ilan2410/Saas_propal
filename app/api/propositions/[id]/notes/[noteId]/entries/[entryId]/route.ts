import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { propositionNoteEntrySchema } from '@/lib/calendar/validation';
import { syncReminder } from '@/lib/calendar/sync';
import { requireEditableNote, requireVisibleProposition } from '@/lib/propositions/note-access';

async function context(id: string, noteId: string, entryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthorized');
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) throw new Error('unauthorized');
  await requireVisibleProposition(supabase, id, ctx);
  const note = await requireEditableNote(supabase, noteId, user, ctx);
  if (note.proposition_id !== id || (note.structure_version ?? 1) !== 2) throw new Error('note_not_found');
  const { data: entry, error } = await supabase.from('proposition_note_entries').select('*').eq('id', entryId).eq('note_id', noteId).single();
  if (error || !entry) throw new Error('entry_not_found');
  if (entry.author_user_id !== user.id && ctx.role !== 'owner') throw new Error('entry_forbidden');
  return { supabase, note, entry };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (message.includes('forbidden')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (message.includes('not_found')) return NextResponse.json({ error: 'Mini-note introuvable' }, { status: 404 });
  return NextResponse.json({ error: 'Erreur lors de la modification' }, { status: 500 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string; entryId: string }> },
) {
  const { id, noteId, entryId } = await params;
  const parsed = propositionNoteEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
  try {
    const { supabase, note } = await context(id, noteId, entryId);
    const { data, error } = await supabase.from('proposition_note_entries').update({ content: parsed.data.content }).eq('id', entryId).select('*').single();
    if (error || !data) throw error ?? new Error('entry_update_failed');
    const syncResults = note.kind === 'reminder' ? await syncReminder(note.id) : [];
    return NextResponse.json({ entry: data, syncResults });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string; entryId: string }> },
) {
  const { id, noteId, entryId } = await params;
  try {
    const { supabase, note } = await context(id, noteId, entryId);
    const { error } = await supabase.from('proposition_note_entries').delete().eq('id', entryId);
    if (error) throw error;
    const syncResults = note.kind === 'reminder' ? await syncReminder(note.id) : [];
    return NextResponse.json({ success: true, syncResults });
  } catch (error) {
    return failure(error);
  }
}
