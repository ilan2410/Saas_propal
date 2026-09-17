import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptCalendarSecret, encryptCalendarSecret } from './crypto';
import { getCalendarProvider } from './provider';
import type { CalendarConnection, CalendarProviderAdapter } from './types';

export async function getCalendarAccess(
  supabase: SupabaseClient,
  connection: CalendarConnection,
): Promise<{ accessToken: string; adapter: CalendarProviderAdapter }> {
  if (connection.status !== 'connected' || !connection.access_token_encrypted) {
    throw new Error('calendar_connection_unavailable');
  }
  const adapter = getCalendarProvider(connection.provider);
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) {
    return { accessToken: decryptCalendarSecret(connection.access_token_encrypted), adapter };
  }
  if (!connection.refresh_token_encrypted) throw new Error('calendar_reconnect_required');
  try {
    const refreshed = await adapter.refreshAccessToken(decryptCalendarSecret(connection.refresh_token_encrypted));
    const refreshToken = refreshed.refreshToken
      ? encryptCalendarSecret(refreshed.refreshToken)
      : connection.refresh_token_encrypted;
    const { error } = await supabase
      .from('calendar_connections')
      .update({
        access_token_encrypted: encryptCalendarSecret(refreshed.accessToken),
        refresh_token_encrypted: refreshToken,
        access_token_expires_at: refreshed.expiresAt,
        granted_scopes: refreshed.scopes,
        status: 'connected',
        last_error: null,
      })
      .eq('id', connection.id);
    if (error) throw error;
    return { accessToken: refreshed.accessToken, adapter };
  } catch (error) {
    await supabase
      .from('calendar_connections')
      .update({ status: 'expired', last_error: error instanceof Error ? error.message : 'Token refresh failed' })
      .eq('id', connection.id);
    throw error;
  }
}

export async function loadCalendarConnection(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<CalendarConnection> {
  const { data, error } = await supabase.from('calendar_connections').select('*').eq('id', connectionId).single();
  if (error || !data) throw new Error('calendar_connection_not_found');
  return data as CalendarConnection;
}
