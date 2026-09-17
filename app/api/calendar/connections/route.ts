import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCalendarAccess } from '@/lib/calendar/connection';
import type { CalendarConnection, CalendarProvider } from '@/lib/calendar/types';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('id, provider, account_email, account_name, status, last_error, connected_at')
    .eq('user_id', user.id)
    .order('provider');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data ?? [] });
}

export async function DELETE(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') as CalendarProvider | null;
  if (!provider || !['google', 'microsoft'].includes(provider)) {
    return NextResponse.json({ error: 'Fournisseur invalide' }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createServiceClient();
  const { data } = await service.from('calendar_connections').select('*').eq('user_id', user.id).eq('provider', provider).maybeSingle();
  if (!data) return NextResponse.json({ success: true });
  const connection = data as CalendarConnection;
  try {
    const { accessToken, adapter } = await getCalendarAccess(service, connection);
    await adapter.revoke?.(accessToken);
  } catch {
  }
  await service.from('calendar_subscriptions').delete().eq('connection_id', connection.id);
  await service.from('calendar_event_links').update({
    connection_id: null,
    sync_status: 'disconnected',
    next_retry_at: null,
    last_error: 'Calendrier déconnecté',
  }).eq('connection_id', connection.id);
  const { error } = await service.from('calendar_connections').update({
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    access_token_expires_at: null,
    status: 'disconnected',
    disconnected_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', connection.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
