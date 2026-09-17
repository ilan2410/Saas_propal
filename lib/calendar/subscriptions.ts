import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calendarFetch } from './http';
import { getCalendarAccess, loadCalendarConnection } from './connection';
import { reconcileExternalEvent } from './sync';
import type { CalendarConnection, CalendarProvider } from './types';

interface CalendarSubscription {
  id: string;
  connection_id: string;
  provider: CalendarProvider;
  calendar_id: string;
  external_subscription_id: string;
  external_resource_id: string | null;
  client_state: string;
  expires_at: string;
}

function webhookUrl(provider: CalendarProvider): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_URL is missing');
  return new URL(`/api/calendar/webhooks/${provider}`, baseUrl).toString();
}

async function createGoogleSubscription(
  service: SupabaseClient,
  connection: CalendarConnection,
  calendarId: string,
  accessToken: string,
) {
  const channelId = randomUUID();
  const clientState = randomBytes(32).toString('base64url');
  const data = await calendarFetch<{ id: string; resourceId: string; expiration?: string }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: webhookUrl('google'),
        token: clientState,
        params: { ttl: '604800' },
      }),
    },
  );
  const expiresAt = data.expiration
    ? new Date(Number(data.expiration)).toISOString()
    : new Date(Date.now() + 6 * 24 * 60 * 60_000).toISOString();
  const { error } = await service.from('calendar_subscriptions').upsert({
    connection_id: connection.id,
    provider: 'google',
    calendar_id: calendarId,
    external_subscription_id: data.id,
    external_resource_id: data.resourceId,
    client_state: clientState,
    expires_at: expiresAt,
    status: 'active',
    last_error: null,
  }, { onConflict: 'connection_id,provider,calendar_id' });
  if (error) throw error;
}

async function createMicrosoftSubscription(
  service: SupabaseClient,
  connection: CalendarConnection,
  calendarId: string,
  accessToken: string,
) {
  const clientState = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
  const data = await calendarFetch<{ id: string; expirationDateTime: string }>('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'updated,deleted',
      notificationUrl: webhookUrl('microsoft'),
      lifecycleNotificationUrl: webhookUrl('microsoft'),
      resource: `/me/calendars/${calendarId}/events`,
      expirationDateTime: expiresAt,
      clientState,
    }),
  });
  const { error } = await service.from('calendar_subscriptions').upsert({
    connection_id: connection.id,
    provider: 'microsoft',
    calendar_id: calendarId,
    external_subscription_id: data.id,
    external_resource_id: null,
    client_state: clientState,
    expires_at: data.expirationDateTime,
    status: 'active',
    last_error: null,
  }, { onConflict: 'connection_id,provider,calendar_id' });
  if (error) throw error;
}

export async function ensureCalendarSubscription(
  service: SupabaseClient,
  connectionId: string,
  calendarId: string,
) {
  const { data: current } = await service
    .from('calendar_subscriptions')
    .select('*')
    .eq('connection_id', connectionId)
    .eq('calendar_id', calendarId)
    .eq('status', 'active')
    .gt('expires_at', new Date(Date.now() + 60 * 60_000).toISOString())
    .maybeSingle();
  if (current) return;
  const connection = await loadCalendarConnection(service, connectionId);
  const { accessToken } = await getCalendarAccess(service, connection);
  if (connection.provider === 'google') {
    await createGoogleSubscription(service, connection, calendarId, accessToken);
  } else {
    await createMicrosoftSubscription(service, connection, calendarId, accessToken);
  }
}

export async function renewCalendarSubscription(service: SupabaseClient, subscription: CalendarSubscription) {
  const connection = await loadCalendarConnection(service, subscription.connection_id);
  const { accessToken } = await getCalendarAccess(service, connection);
  try {
    if (subscription.provider === 'microsoft') {
      const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
      const data = await calendarFetch<{ expirationDateTime: string }>(
        `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscription.external_subscription_id)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expirationDateTime: expiresAt }),
        },
      );
      await service.from('calendar_subscriptions').update({ expires_at: data.expirationDateTime, status: 'active', last_error: null }).eq('id', subscription.id);
    } else {
      await calendarFetch<unknown>('https://www.googleapis.com/calendar/v3/channels/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subscription.external_subscription_id, resourceId: subscription.external_resource_id }),
      }).catch(() => null);
      await createGoogleSubscription(service, connection, subscription.calendar_id, accessToken);
    }
  } catch (error) {
    await service.from('calendar_subscriptions').update({ status: 'error', last_error: error instanceof Error ? error.message : 'subscription_renewal_failed' }).eq('id', subscription.id);
    throw error;
  }
}

export async function processCalendarSubscription(service: SupabaseClient, subscription: CalendarSubscription) {
  const connection = await loadCalendarConnection(service, subscription.connection_id);
  const { accessToken, adapter } = await getCalendarAccess(service, connection);
  const { data } = await service
    .from('calendar_event_links')
    .select('*')
    .eq('connection_id', connection.id)
    .eq('calendar_id', subscription.calendar_id)
    .not('external_event_id', 'is', null);
  for (const link of data ?? []) {
    const event = await adapter.getEvent(accessToken, link.calendar_id, link.external_event_id);
    await reconcileExternalEvent(link.id, event);
  }
}

export type { CalendarSubscription };
