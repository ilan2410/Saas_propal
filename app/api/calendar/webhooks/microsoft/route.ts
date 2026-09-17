import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { processCalendarSubscription } from '@/lib/calendar/subscriptions';

interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  lifecycleEvent?: string;
}

export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  const body = await request.json().catch(() => null) as { value?: GraphNotification[] } | null;
  if (!body?.value?.length) return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
  const service = createServiceClient();
  const processed = new Set<string>();
  for (const notification of body.value) {
    if (!notification.subscriptionId || !notification.clientState || processed.has(notification.subscriptionId)) continue;
    const { data: subscription } = await service
      .from('calendar_subscriptions')
      .select('*')
      .eq('provider', 'microsoft')
      .eq('external_subscription_id', notification.subscriptionId)
      .eq('client_state', notification.clientState)
      .maybeSingle();
    if (!subscription) continue;
    processed.add(notification.subscriptionId);
    if (notification.lifecycleEvent === 'subscriptionRemoved') {
      await service.from('calendar_subscriptions').update({ status: 'expired', last_error: 'Subscription supprimée par Microsoft' }).eq('id', subscription.id);
      continue;
    }
    try {
      await processCalendarSubscription(service, subscription);
    } catch (error) {
      await service.from('calendar_subscriptions').update({ last_error: error instanceof Error ? error.message : 'webhook_processing_failed' }).eq('id', subscription.id);
    }
  }
  return NextResponse.json({ received: true });
}
