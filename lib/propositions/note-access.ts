import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { OrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from './visibility';
import type { PropositionNote } from '@/lib/calendar/types';

export async function requireVisibleProposition(
  supabase: SupabaseClient,
  propositionId: string,
  ctx: OrgContext,
) {
  const { data, error } = await scopePropositionsQuery(
    supabase.from('propositions').select('id, organization_id, nom_client, extracted_data').eq('id', propositionId),
    ctx,
  ).single();
  if (error || !data) throw new Error('proposition_not_found');
  return data;
}

export async function requireEditableNote(
  supabase: SupabaseClient,
  noteId: string,
  user: User,
  ctx: OrgContext,
): Promise<PropositionNote> {
  const { data, error } = await supabase.from('proposition_notes').select('*').eq('id', noteId).single();
  if (error || !data) throw new Error('note_not_found');
  const note = data as PropositionNote;
  if (note.organization_id !== ctx.organizationId || (note.author_user_id !== user.id && ctx.role !== 'owner')) {
    throw new Error('note_forbidden');
  }
  return note;
}
