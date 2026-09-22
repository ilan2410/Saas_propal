import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processCalendarSubscription } from '@/lib/calendar/subscriptions';

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceId = request.headers.get('x-goog-resource-id');
  const token = request.headers.get('x-goog-channel-token');
  if (!channelId || !resourceId || !token) return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
  const service = createServiceClient();
  const { data: subscription } = await service
    .from('calendar_subscriptions')
    .select('*')
    .eq('provider', 'google')
    .eq('external_subscription_id', channelId)
    .eq('external_resource_id', resourceId)
    .eq('client_state', token)
    .eq('status', 'active')
    .maybeSingle();
  if (!subscription) return NextResponse.json({ error: 'Unknown channel' }, { status: 403 });
  try {
    await processCalendarSubscription(service, subscription);
    return NextResponse.json({ received: true });
  } catch (error) {
    await service.from('calendar_subscriptions').update({ last_error: error instanceof Error ? error.message : 'webhook_processing_failed' }).eq('id', subscription.id);
    return NextResponse.json({ received: true });
  }
}
