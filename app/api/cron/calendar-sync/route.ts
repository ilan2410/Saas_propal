import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ensureCalendarSubscription, renewCalendarSubscription } from '@/lib/calendar/subscriptions';
import { syncReminder } from '@/lib/calendar/sync';
import { getCalendarAccess, loadCalendarConnection } from '@/lib/calendar/connection';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CALENDAR_CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createServiceClient();
  const renewalLimit = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { data: subscriptions } = await service
    .from('calendar_subscriptions')
    .select('*')
    .lte('expires_at', renewalLimit)
    .limit(100);
  const renewalResults = [];
  for (const subscription of subscriptions ?? []) {
    try {
      await renewCalendarSubscription(service, subscription);
      renewalResults.push({ id: subscription.id, ok: true });
    } catch (error) {
      renewalResults.push({ id: subscription.id, ok: false, error: error instanceof Error ? error.message : 'renewal_failed' });
    }
  }

  const { data: retryLinks } = await service
    .from('calendar_event_links')
    .select('note_id')
    .in('sync_status', ['pending', 'error'])
    .lte('next_retry_at', new Date().toISOString())
    .limit(200);
  const noteIds = [...new Set((retryLinks ?? []).map((link) => link.note_id))];
  const syncResults = [];
  for (const noteId of noteIds) {
    try {
      syncResults.push({ noteId, results: await syncReminder(noteId) });
    } catch (error) {
      syncResults.push({ noteId, error: error instanceof Error ? error.message : 'sync_failed' });
    }
  }

  const { data: activeLinks } = await service
    .from('calendar_event_links')
    .select('connection_id, calendar_id')
    .not('connection_id', 'is', null)
    .neq('sync_status', 'disconnected')
    .limit(500);
  const subscriptionResults = [];
  const targetKeys = new Set<string>();
  for (const link of activeLinks ?? []) {
    const key = `${link.connection_id}:${link.calendar_id}`;
    if (targetKeys.has(key)) continue;
    targetKeys.add(key);
    try {
      await ensureCalendarSubscription(service, link.connection_id, link.calendar_id);
      subscriptionResults.push({ key, ok: true });
    } catch (error) {
      subscriptionResults.push({ key, ok: false, error: error instanceof Error ? error.message : 'subscription_failed' });
    }
  }
  const { data: deletionJobs } = await service
    .from('calendar_deletion_jobs')
    .select('*')
    .lte('next_retry_at', new Date().toISOString())
    .limit(100);
  const deletionResults = [];
  for (const job of deletionJobs ?? []) {
    try {
      if (!job.connection_id) throw new Error('calendar_connection_missing');
      const connection = await loadCalendarConnection(service, job.connection_id);
      const { accessToken, adapter } = await getCalendarAccess(service, connection);
      await adapter.deleteEvent(accessToken, job.calendar_id, job.external_event_id);
      await service.from('calendar_deletion_jobs').delete().eq('id', job.id);
      deletionResults.push({ id: job.id, ok: true });
    } catch (error) {
      const retryCount = job.retry_count + 1;
      await service.from('calendar_deletion_jobs').update({
        retry_count: retryCount,
        next_retry_at: new Date(Date.now() + Math.min(1440, 2 ** Math.min(retryCount, 10)) * 60_000).toISOString(),
        last_error: error instanceof Error ? error.message : 'deletion_failed',
      }).eq('id', job.id);
      deletionResults.push({ id: job.id, ok: false });
    }
  }
  return NextResponse.json({ renewals: renewalResults, syncs: syncResults, subscriptions: subscriptionResults, deletions: deletionResults });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
