import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { resolvePropositionClientName } from '@/lib/propositions/clientName';
import { getCalendarAccess, loadCalendarConnection } from './connection';
import { calendarEventHash, noteToCalendarEvent } from './hash';
import { resolveCalendarConflict } from './conflict';
import { parseCalendarDescription, reconcileCalendarLines, todayInTimeZone } from './note-description';
import type { CalendarTarget, ExternalCalendarEvent, PropositionNote, PropositionNoteEntry } from './types';

interface EventLink {
  id: string;
  note_id: string;
  connection_id: string | null;
  provider: 'google' | 'microsoft';
  calendar_id: string;
  calendar_name: string | null;
  external_event_id: string | null;
  external_updated_at: string | null;
  external_etag: string | null;
  last_synced_note_updated_at: string | null;
  last_synced_hash: string | null;
  sync_status: string;
  retry_count: number;
}

function retryAt(retryCount: number): string {
  const minutes = Math.min(24 * 60, Math.max(1, 2 ** Math.min(retryCount, 10)));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function loadReminderContext(service: SupabaseClient, noteId: string) {
  const { data: note, error } = await service.from('proposition_notes').select('*').eq('id', noteId).single();
  if (error || !note) throw new Error('note_not_found');
  const typedNote = note as PropositionNote;
  const [{ data: proposition }, { data: entries }] = await Promise.all([
    service
      .from('propositions')
      .select('nom_client, extracted_data')
      .eq('id', typedNote.proposition_id)
      .single(),
    service
      .from('proposition_note_entries')
      .select('*')
      .eq('note_id', typedNote.id)
      .order('created_at', { ascending: true }),
  ]);
  return {
    note: typedNote,
    entries: (entries ?? []) as PropositionNoteEntry[],
    clientName: resolvePropositionClientName(proposition?.extracted_data, proposition?.nom_client),
  };
}

async function syncLink(
  service: SupabaseClient,
  link: EventLink,
  note: PropositionNote,
  entries: PropositionNoteEntry[],
  clientName: string,
) {
  const attemptedAt = new Date().toISOString();
  try {
    if (!link.connection_id) throw new Error('calendar_connection_disconnected');
    const connection = await loadCalendarConnection(service, link.connection_id);
    if (connection.user_id !== note.author_user_id || connection.provider !== link.provider) {
      throw new Error('calendar_connection_forbidden');
    }
    const { accessToken, adapter } = await getCalendarAccess(service, connection);
    const event = noteToCalendarEvent(note, clientName, entries);
    const result = link.external_event_id
      ? await adapter.updateEvent(accessToken, link.calendar_id, link.external_event_id, event)
      : await adapter.createEvent(accessToken, link.calendar_id, event);
    await service.from('calendar_event_links').update({
      external_event_id: result.id,
      external_updated_at: result.updatedAt,
      external_etag: result.etag,
      last_synced_note_updated_at: note.updated_at,
      last_synced_hash: calendarEventHash(event),
      sync_status: 'synced',
      last_error: null,
      retry_count: 0,
      next_retry_at: null,
      last_attempted_at: attemptedAt,
    }).eq('id', link.id);
    return { linkId: link.id, ok: true as const };
  } catch (error) {
    const retryCount = link.retry_count + 1;
    const message = error instanceof Error ? error.message : 'calendar_sync_failed';
    await service.from('calendar_event_links').update({
      sync_status: link.connection_id ? 'error' : 'disconnected',
      last_error: message,
      retry_count: retryCount,
      next_retry_at: link.connection_id ? retryAt(retryCount) : null,
      last_attempted_at: attemptedAt,
    }).eq('id', link.id);
    return { linkId: link.id, ok: false as const, error: message };
  }
}

export async function syncReminder(noteId: string, excludeLinkId?: string) {
  const service = createServiceClient();
  const { note, entries, clientName } = await loadReminderContext(service, noteId);
  if (note.kind !== 'reminder') return [];
  const { data } = await service.from('calendar_event_links').select('*').eq('note_id', noteId);
  const links = (data ?? []) as EventLink[];
  return Promise.all(links.filter((link) => link.id !== excludeLinkId).map((link) => syncLink(service, link, note, entries, clientName)));
}

async function deleteLinkEvent(service: SupabaseClient, link: EventLink, authorUserId: string): Promise<boolean> {
  if (!link.connection_id || !link.external_event_id) return true;
  try {
    const connection = await loadCalendarConnection(service, link.connection_id);
    if (connection.user_id !== authorUserId) return false;
    const { accessToken, adapter } = await getCalendarAccess(service, connection);
    await adapter.deleteEvent(accessToken, link.calendar_id, link.external_event_id);
    return true;
  } catch {
    return false;
  }
}

async function queueEventDeletion(service: SupabaseClient, link: EventLink) {
  if (!link.connection_id || !link.external_event_id) return;
  await service.from('calendar_deletion_jobs').upsert({
    connection_id: link.connection_id,
    provider: link.provider,
    calendar_id: link.calendar_id,
    external_event_id: link.external_event_id,
    next_retry_at: new Date().toISOString(),
  }, { onConflict: 'provider,calendar_id,external_event_id' });
}

export async function replaceReminderTargets(note: PropositionNote, targets: CalendarTarget[]) {
  const service = createServiceClient();
  const { data } = await service.from('calendar_event_links').select('*').eq('note_id', note.id);
  const existing = (data ?? []) as EventLink[];
  const keys = new Set(targets.map((target) => `${target.provider}:${target.calendarId}`));
  const removed = existing.filter((link) => !keys.has(`${link.provider}:${link.calendar_id}`));
  const deletionResults = await Promise.all(removed.map((link) => deleteLinkEvent(service, link, note.author_user_id)));
  await Promise.all(removed.filter((_, index) => !deletionResults[index]).map((link) => queueEventDeletion(service, link)));
  if (removed.length) await service.from('calendar_event_links').delete().in('id', removed.map((link) => link.id));

  for (const target of targets) {
    const connection = await loadCalendarConnection(service, target.connectionId);
    if (connection.user_id !== note.author_user_id || connection.provider !== target.provider || connection.status !== 'connected') {
      throw new Error('calendar_target_forbidden');
    }
    const current = existing.find((link) => link.provider === target.provider && link.calendar_id === target.calendarId);
    const { error } = await service.from('calendar_event_links').upsert({
      note_id: note.id,
      connection_id: target.connectionId,
      provider: target.provider,
      calendar_id: target.calendarId,
      calendar_name: target.calendarName ?? null,
      external_event_id: current?.external_event_id ?? null,
      external_updated_at: current?.external_updated_at ?? null,
      external_etag: current?.external_etag ?? null,
      sync_status: 'pending',
      last_error: null,
      next_retry_at: new Date().toISOString(),
    }, { onConflict: 'note_id,provider,calendar_id' });
    if (error) throw error;
  }
  const results = await syncReminder(note.id);
  const { ensureCalendarSubscription } = await import('./subscriptions');
  for (const target of targets) {
    try {
      await ensureCalendarSubscription(service, target.connectionId, target.calendarId);
    } catch (error) {
      results.push({
        linkId: existing.find((link) => link.provider === target.provider && link.calendar_id === target.calendarId)?.id ?? target.calendarId,
        ok: false,
        error: error instanceof Error ? error.message : 'calendar_subscription_failed',
      });
    }
  }
  return results;
}

export async function deleteReminderEverywhere(noteId: string, sourceLinkId?: string) {
  const service = createServiceClient();
  const { data: note } = await service.from('proposition_notes').select('*').eq('id', noteId).maybeSingle();
  if (!note) return;
  const { data } = await service.from('calendar_event_links').select('*').eq('note_id', noteId);
  const links = (data ?? []) as EventLink[];
  const remoteLinks = links.filter((link) => link.id !== sourceLinkId);
  const deletionResults = await Promise.all(remoteLinks.map((link) => deleteLinkEvent(service, link, note.author_user_id)));
  await Promise.all(remoteLinks.filter((_, index) => !deletionResults[index]).map((link) => queueEventDeletion(service, link)));
  await service.from('proposition_notes').delete().eq('id', noteId);
}

function externalContent(description: string | null): string | null {
  if (!description) return null;
  const separator = description.indexOf('\n\n');
  return separator >= 0 ? description.slice(separator + 2).trim() || null : description.trim() || null;
}

async function reconcileStructuredEntries(
  service: SupabaseClient,
  note: PropositionNote,
  entries: PropositionNoteEntry[],
  description: string | null,
) {
  const fallbackDate = todayInTimeZone(note.timezone || 'Europe/Paris');
  const reconciliation = reconcileCalendarLines(entries, parseCalendarDescription(description, fallbackDate));
  const results = await Promise.all([
    ...reconciliation.updates.map((entry) => service
      .from('proposition_note_entries')
      .update({ entry_date: entry.entryDate, content: entry.content })
      .eq('id', entry.id)),
    ...reconciliation.creates.map((entry) => service
      .from('proposition_note_entries')
      .insert({
        note_id: note.id,
        organization_id: note.organization_id,
        author_user_id: note.author_user_id,
        entry_date: entry.entryDate,
        content: entry.content,
      })),
  ]);
  const writeError = results.find((result) => result.error)?.error;
  if (writeError) throw writeError;
  if (reconciliation.deletes.length) {
    const { error } = await service.from('proposition_note_entries').delete().in('id', reconciliation.deletes);
    if (error) throw error;
  }
}

export async function reconcileExternalEvent(linkId: string, event: ExternalCalendarEvent | null) {
  const service = createServiceClient();
  const { data: linkData } = await service.from('calendar_event_links').select('*').eq('id', linkId).single();
  if (!linkData) return;
  const link = linkData as EventLink;
  if (!event || event.deleted) {
    await deleteReminderEverywhere(link.note_id, link.id);
    return;
  }
  const { note, entries, clientName } = await loadReminderContext(service, link.note_id);
  const winner = resolveCalendarConflict(note.updated_at, event.updatedAt, link.last_synced_note_updated_at, link.external_updated_at);
  if (winner === 'external') {
    const { data: updated } = await service.from('proposition_notes').update({
      title: event.title.trim() || note.title,
      content: note.structure_version === 2 ? null : externalContent(event.description),
      starts_at: event.startsAt,
      duration_minutes: event.durationMinutes,
      alert_enabled: event.alertEnabled,
      alert_minutes: event.alertMinutes,
    }).eq('id', note.id).select('*').single();
    if (!updated) return;
    if (note.structure_version === 2) {
      await reconcileStructuredEntries(service, note, entries, event.description);
      await syncReminder(note.id);
      return;
    }
    const updatedNote = updated as PropositionNote;
    const eventInput = noteToCalendarEvent(updatedNote, clientName, entries);
    await service.from('calendar_event_links').update({
      external_updated_at: event.updatedAt,
      external_etag: event.etag,
      last_synced_note_updated_at: updatedNote.updated_at,
      last_synced_hash: calendarEventHash(eventInput),
      sync_status: 'synced',
      last_error: null,
    }).eq('id', link.id);
    await syncReminder(note.id, link.id);
    return;
  }
  if (winner === 'internal') {
    await syncLink(service, link, note, entries, clientName);
    return;
  }
  await service.from('calendar_event_links').update({
    external_updated_at: event.updatedAt,
    external_etag: event.etag,
    sync_status: 'synced',
    last_error: null,
  }).eq('id', link.id);
}
