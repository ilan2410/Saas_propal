import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { propositionNoteInputSchema } from '@/lib/calendar/validation';
import { deleteReminderEverywhere, replaceReminderTargets } from '@/lib/calendar/sync';
import { requireEditableNote, requireVisibleProposition } from '@/lib/propositions/note-access';
import type { PropositionNote } from '@/lib/calendar/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = propositionNoteInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
  try {
    await requireVisibleProposition(supabase, id, ctx);
    const current = await requireEditableNote(supabase, noteId, user, ctx);
    if (current.proposition_id !== id) throw new Error('note_not_found');
    const value = parsed.data;
    const { data, error } = await supabase.from('proposition_notes').update({
      kind: value.kind,
      title: value.kind === 'reminder' ? value.title : null,
      content: value.content || null,
      starts_at: value.kind === 'reminder' ? value.startsAt : null,
      timezone: value.kind === 'reminder' ? value.timezone : null,
      duration_minutes: value.kind === 'reminder' ? value.durationMinutes : null,
      alert_enabled: value.kind === 'reminder' && value.alertEnabled,
      alert_minutes: value.kind === 'reminder' && value.alertEnabled ? value.alertMinutes : null,
    }).eq('id', noteId).select('*').single();
    if (error || !data) throw error ?? new Error('note_update_failed');
    const note = data as PropositionNote;
    let syncResults: unknown[] = [];
    let syncError: string | null = null;
    try {
      syncResults = await replaceReminderTargets(note, value.kind === 'reminder' ? value.targets : []);
    } catch (error) {
      syncError = error instanceof Error ? error.message : 'calendar_sync_failed';
    }
    return NextResponse.json({ note, syncResults, syncError });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.includes('forbidden') ? 403 : message.includes('not_found') ? 404 : 500;
    return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 404 ? 'Note introuvable' : 'Erreur lors de la modification' }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await requireVisibleProposition(supabase, id, ctx);
    const note = await requireEditableNote(supabase, noteId, user, ctx);
    if (note.proposition_id !== id) throw new Error('note_not_found');
    await deleteReminderEverywhere(noteId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.includes('forbidden') ? 403 : message.includes('not_found') ? 404 : 500;
    return NextResponse.json({ error: status === 403 ? 'Forbidden' : status === 404 ? 'Note introuvable' : 'Erreur lors de la suppression' }, { status });
  }
}
