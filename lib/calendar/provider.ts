import { googleCalendarAdapter } from './google';
import { microsoftCalendarAdapter } from './microsoft';
import type { CalendarProvider, CalendarProviderAdapter } from './types';

export function getCalendarProvider(provider: CalendarProvider): CalendarProviderAdapter {
  return provider === 'google' ? googleCalendarAdapter : microsoftCalendarAdapter;
}
