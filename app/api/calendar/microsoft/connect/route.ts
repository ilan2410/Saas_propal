import { startCalendarOAuth } from '@/lib/calendar/oauth';

export async function GET() {
  return startCalendarOAuth('microsoft');
}
