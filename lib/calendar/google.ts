import { CalendarProviderError, calendarFetch } from './http';
import type {
  CalendarAccount,
  CalendarAgenda,
  CalendarEventInput,
  CalendarEventResult,
  CalendarProviderAdapter,
  CalendarTokenSet,
  ExternalCalendarEvent,
} from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://www.googleapis.com/calendar/v3';
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

function config() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  if (!clientId || !clientSecret || !baseUrl) throw new Error('Google Calendar OAuth is not configured');
  return { clientId, clientSecret, redirectUri: new URL('/api/calendar/google/callback', baseUrl).toString() };
}

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

function tokenSet(data: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }): CalendarTokenSet {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scopes: data.scope?.split(' ').filter(Boolean) ?? SCOPES,
  };
}

function eventBody(event: CalendarEventInput) {
  const end = new Date(new Date(event.startsAt).getTime() + event.durationMinutes * 60_000).toISOString();
  return {
    summary: event.title,
    description: event.description,
    start: { dateTime: event.startsAt, timeZone: event.timezone },
    end: { dateTime: end, timeZone: event.timezone },
    reminders: event.alertEnabled
      ? { useDefault: false, overrides: [{ method: 'popup', minutes: event.alertMinutes ?? 0 }] }
      : { useDefault: false, overrides: [] },
    extendedProperties: { private: { propoboostNoteId: event.noteId } },
  };
}

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  updated?: string;
  etag?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
};

function parseEvent(event: GoogleEvent): ExternalCalendarEvent | null {
  if (event.status === 'cancelled') return event.id ? {
    id: event.id,
    title: '',
    description: null,
    startsAt: new Date(0).toISOString(),
    durationMinutes: 0,
    alertEnabled: false,
    alertMinutes: null,
    updatedAt: event.updated ?? new Date().toISOString(),
    etag: event.etag ?? null,
    deleted: true,
  } : null;
  if (!event.id || !event.start?.dateTime || !event.end?.dateTime) return null;
  const override = event.reminders?.overrides?.find((item) => item.method === 'popup');
  return {
    id: event.id,
    title: event.summary ?? '',
    description: event.description ?? null,
    startsAt: new Date(event.start.dateTime).toISOString(),
    durationMinutes: Math.max(5, Math.round((new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60_000)),
    alertEnabled: Boolean(override),
    alertMinutes: override?.minutes ?? null,
    updatedAt: event.updated ?? new Date().toISOString(),
    etag: event.etag ?? null,
  };
}

export const googleCalendarAdapter: CalendarProviderAdapter = {
  provider: 'google',
  authorizationUrl(state) {
    const { clientId, redirectUri } = config();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params}`;
  },
  async exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = config();
    const data = await calendarFetch<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    return tokenSet(data);
  },
  async refreshAccessToken(refreshToken) {
    const { clientId, clientSecret } = config();
    const data = await calendarFetch<{ access_token: string; expires_in: number; scope?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
    });
    return tokenSet(data);
  },
  async getAccount(accessToken): Promise<CalendarAccount> {
    const data = await calendarFetch<{ sub: string; email?: string; name?: string }>('https://openidconnect.googleapis.com/v1/userinfo', { headers: headers(accessToken) });
    return { id: data.sub, email: data.email ?? null, name: data.name ?? null };
  },
  async listAgendas(accessToken): Promise<CalendarAgenda[]> {
    const data = await calendarFetch<{ items?: { id: string; summary?: string; primary?: boolean; accessRole?: string; timeZone?: string }[] }>(`${API_URL}/users/me/calendarList?maxResults=250`, { headers: headers(accessToken) });
    return (data.items ?? []).filter((item) => ['writer', 'owner'].includes(item.accessRole ?? '')).map((item) => ({
      id: item.id,
      name: item.summary ?? item.id,
      provider: 'google',
      primary: Boolean(item.primary),
      canWrite: true,
      timezone: item.timeZone,
    }));
  },
  async createEvent(accessToken, calendarId, event): Promise<CalendarEventResult> {
    const eventId = event.noteId.replaceAll('-', '').toLowerCase();
    try {
      const data = await calendarFetch<GoogleEvent>(`${API_URL}/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', headers: headers(accessToken), body: JSON.stringify({ id: eventId, ...eventBody(event) }) });
      return { id: data.id, updatedAt: data.updated ?? new Date().toISOString(), etag: data.etag ?? null };
    } catch (error) {
      if (!(error instanceof CalendarProviderError) || error.status !== 409) throw error;
      const existing = await calendarFetch<GoogleEvent>(`${API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { headers: headers(accessToken) });
      return { id: existing.id, updatedAt: existing.updated ?? new Date().toISOString(), etag: existing.etag ?? null };
    }
  },
  async updateEvent(accessToken, calendarId, eventId, event): Promise<CalendarEventResult> {
    const data = await calendarFetch<GoogleEvent>(`${API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', headers: headers(accessToken), body: JSON.stringify(eventBody(event)) });
    return { id: data.id, updatedAt: data.updated ?? new Date().toISOString(), etag: data.etag ?? null };
  },
  async deleteEvent(accessToken, calendarId, eventId) {
    try {
      await calendarFetch<unknown>(`${API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: headers(accessToken) });
    } catch (error) {
      if (!(error instanceof CalendarProviderError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
  },
  async getEvent(accessToken, calendarId, eventId) {
    try {
      return parseEvent(await calendarFetch<GoogleEvent>(`${API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { headers: headers(accessToken) }));
    } catch (error) {
      if (error instanceof CalendarProviderError && (error.status === 404 || error.status === 410)) return null;
      throw error;
    }
  },
  async revoke(accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  },
};
