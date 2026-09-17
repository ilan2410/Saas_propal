import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { calendarTargetsSchema } from '@/lib/calendar/validation';
import { replaceReminderTargets, syncReminder } from '@/lib/calendar/sync';
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
  try {
    await requireVisibleProposition(supabase, id, ctx);
    const note = await requireEditableNote(supabase, noteId, user, ctx);
    if (note.proposition_id !== id || note.kind !== 'reminder') throw new Error('note_not_found');
    const body = await request.json().catch(() => ({}));
    if ('targets' in body) {
      const targets = calendarTargetsSchema.safeParse(body.targets);
      if (!targets.success) return NextResponse.json({ error: targets.error.issues[0]?.message ?? 'Cibles invalides' }, { status: 400 });
      return NextResponse.json({ results: await replaceReminderTargets(note, targets.data) });
    }
    return NextResponse.json({ results: await syncReminder(noteId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.includes('forbidden') ? 403 : message.includes('not_found') ? 404 : 500;
    return NextResponse.json({ error: status === 500 ? message || 'Erreur de synchronisation' : status === 403 ? 'Forbidden' : 'Rappel introuvable' }, { status });
  }
}
