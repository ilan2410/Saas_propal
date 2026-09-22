import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCalendarAccess, loadCalendarConnection } from '@/lib/calendar/connection';

export async function GET(request: NextRequest) {
  const connectionId = request.nextUrl.searchParams.get('connectionId');
  if (!connectionId) return NextResponse.json({ error: 'Connexion requise' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const service = createServiceClient();
    const connection = await loadCalendarConnection(service, connectionId);
    if (connection.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { accessToken, adapter } = await getCalendarAccess(service, connection);
    return NextResponse.json({ agendas: await adapter.listAgendas(accessToken) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur calendrier' }, { status: 502 });
  }
}
