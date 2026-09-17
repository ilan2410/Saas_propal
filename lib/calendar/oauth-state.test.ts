import { afterEach, describe, expect, it } from 'vitest';
import { createCalendarOAuthState, verifyCalendarOAuthState } from './oauth-state';

const originalSecret = process.env.CALENDAR_OAUTH_STATE_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CALENDAR_OAUTH_STATE_SECRET;
  else process.env.CALENDAR_OAUTH_STATE_SECRET = originalSecret;
});

describe('calendar OAuth state', () => {
  it('verifies the provider, nonce and signature', () => {
    process.env.CALENDAR_OAUTH_STATE_SECRET = 'test-secret-with-sufficient-entropy';
    const { state, nonce } = createCalendarOAuthState('user-1', 'google');
    expect(verifyCalendarOAuthState(state, nonce, 'google').userId).toBe('user-1');
    expect(() => verifyCalendarOAuthState(state, 'other', 'google')).toThrow('invalid_state');
    expect(() => verifyCalendarOAuthState(state, nonce, 'microsoft')).toThrow('invalid_state');
    expect(() => verifyCalendarOAuthState(`${state.slice(0, -1)}x`, nonce, 'google')).toThrow('invalid_state');
  });
});
