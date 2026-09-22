import { describe, expect, it } from 'vitest';
import { MICROSOFT_MAILBOX_SUBSCRIPTION, subscriptionCalendarId } from './subscriptions';

describe('subscriptionCalendarId', () => {
  it('uses one mailbox-wide subscription for Microsoft events', () => {
    expect(subscriptionCalendarId('microsoft', 'calendar-a')).toBe(MICROSOFT_MAILBOX_SUBSCRIPTION);
    expect(subscriptionCalendarId('microsoft', 'calendar-b')).toBe(MICROSOFT_MAILBOX_SUBSCRIPTION);
  });

  it('keeps one Google channel per calendar', () => {
    expect(subscriptionCalendarId('google', 'primary')).toBe('primary');
  });
});
