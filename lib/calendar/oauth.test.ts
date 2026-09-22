import { describe, expect, it } from 'vitest';
import { CalendarProviderError } from './http';
import { oauthErrorCode } from './oauth';

describe('oauthErrorCode', () => {
  it('identifies a Microsoft client secret mismatch', () => {
    const error = new CalendarProviderError('Calendar provider returned 401', 401, {
      error: 'invalid_client',
      error_description: 'AADSTS7000215: Invalid client secret provided.',
    });
    expect(oauthErrorCode(error, 'microsoft')).toBe('microsoft_invalid_client_secret');
  });

  it('identifies a missing calendar migration', () => {
    expect(oauthErrorCode({ code: '42P01', message: 'relation does not exist' }, 'google')).toBe('calendar_migration_missing');
  });
});
