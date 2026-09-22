import { NextRequest } from 'next/server';
import { finishCalendarOAuth } from '@/lib/calendar/oauth';

export async function GET(request: NextRequest) {
  return finishCalendarOAuth(request, 'google');
}
