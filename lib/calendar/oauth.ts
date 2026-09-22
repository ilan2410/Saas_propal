import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { encryptCalendarSecret } from './crypto';
import { createCalendarOAuthState, verifyCalendarOAuthState } from './oauth-state';
import { getCalendarProvider } from './provider';
import { CalendarProviderError } from './http';
import type { CalendarProvider } from './types';

const cookieName = (provider: CalendarProvider) => `calendar_oauth_${provider}`;

export function oauthErrorCode(error: unknown, provider: CalendarProvider): string {
  if (error instanceof CalendarProviderError) {
    const body = error.body && typeof error.body === 'object' ? error.body as Record<string, unknown> : {};
    const providerCode = typeof body.error === 'string' ? body.error : '';
    const description = typeof body.error_description === 'string' ? body.error_description : '';
    if (providerCode === 'invalid_client' || /client secret|AADSTS7000215|AADSTS7000222/i.test(description)) {
      return provider === 'microsoft' ? 'microsoft_invalid_client_secret' : 'provider_invalid_client';
    }
    if (providerCode === 'invalid_grant') return 'authorization_code_invalid';
    if (providerCode === 'unauthorized_client') return 'provider_unauthorized_client';
    return 'provider_token_exchange_failed';
  }
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const message = error instanceof Error ? error.message : typeof record.message === 'string' ? record.message : '';
  if (code === '42P01' || code === 'PGRST205') return 'calendar_migration_missing';
  if (message.includes('CALENDAR_TOKEN_ENCRYPTION_KEY')) return 'calendar_encryption_key_invalid';
  if (message === 'missing_refresh_token') return 'missing_refresh_token';
  if (message === 'invalid_state' || message === 'invalid_user') return 'oauth_session_expired';
  return 'callback_failed';
}

export async function startCalendarOAuth(provider: CalendarProvider) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { state, nonce } = createCalendarOAuthState(user.id, provider);
  const response = NextResponse.redirect(getCalendarProvider(provider).authorizationUrl(state));
  response.cookies.set(cookieName(provider), nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}

export async function finishCalendarOAuth(request: NextRequest, provider: CalendarProvider) {
  const baseUrl = process.env.NEXT_PUBLIC_URL || request.nextUrl.origin;
  const settingsUrl = new URL('/settings?tab=calendriers', baseUrl);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const nonce = request.cookies.get(cookieName(provider))?.value;
  if (!code || !state || !nonce) {
    settingsUrl.searchParams.set('calendar_error', 'missing_callback_parameters');
    return NextResponse.redirect(settingsUrl);
  }
  try {
    const payload = verifyCalendarOAuthState(state, nonce, provider);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== payload.userId) throw new Error('invalid_user');
    const ctx = await resolveOrgContext(supabase, user);
    if (!ctx) throw new Error('invalid_organization');
    const adapter = getCalendarProvider(provider);
    const tokens = await adapter.exchangeCode(code);
    const account = await adapter.getAccount(tokens.accessToken);
    const service = createServiceClient();
    const existing = await service
      .from('calendar_connections')
      .select('refresh_token_encrypted')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .maybeSingle();
    const refreshToken = tokens.refreshToken
      ? encryptCalendarSecret(tokens.refreshToken)
      : existing.data?.refresh_token_encrypted;
    if (!refreshToken) throw new Error('missing_refresh_token');
    const { error } = await service.from('calendar_connections').upsert({
      organization_id: ctx.organizationId,
      user_id: user.id,
      provider,
      provider_account_id: account.id,
      account_email: account.email,
      account_name: account.name,
      access_token_encrypted: encryptCalendarSecret(tokens.accessToken),
      refresh_token_encrypted: refreshToken,
      access_token_expires_at: tokens.expiresAt,
      granted_scopes: tokens.scopes,
      status: 'connected',
      last_error: null,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
    }, { onConflict: 'user_id,provider' });
    if (error) throw error;
    settingsUrl.searchParams.set('calendar_connected', provider);
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(cookieName(provider));
    return response;
  } catch (error) {
    const errorCode = oauthErrorCode(error, provider);
    console.error('Calendar OAuth callback failed', {
      provider,
      errorCode,
      status: error instanceof CalendarProviderError ? error.status : undefined,
    });
    settingsUrl.searchParams.set('calendar_error', errorCode);
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(cookieName(provider));
    return response;
  }
}
