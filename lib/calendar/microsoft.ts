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

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const API_URL = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Calendars.ReadWrite'];

function config() {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  if (!clientId || !clientSecret || !baseUrl) throw new Error('Microsoft Calendar OAuth is not configured');
  return { clientId, clientSecret, redirectUri: new URL('/api/calendar/microsoft/callback', baseUrl).toString() };
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

function graphDate(value: string): string {
  return new Date(value).toISOString().replace(/Z$/, '');
}

function eventBody(event: CalendarEventInput) {
  const end = new Date(new Date(event.startsAt).getTime() + event.durationMinutes * 60_000).toISOString();
  return {
    subject: event.title,
    body: { contentType: 'text', content: event.description },
    start: { dateTime: graphDate(event.startsAt), timeZone: 'UTC' },
    end: { dateTime: graphDate(end), timeZone: 'UTC' },
    isReminderOn: event.alertEnabled,
    reminderMinutesBeforeStart: event.alertEnabled ? event.alertMinutes ?? 0 : 0,
    transactionId: event.noteId,
  };
}

type MicrosoftEvent = {
  id: string;
  subject?: string;
  body?: { content?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isReminderOn?: boolean;
  reminderMinutesBeforeStart?: number;
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
};

function toIso(value?: string): string {
  if (!value) return new Date(0).toISOString();
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toISOString();
}

function parseEvent(event: MicrosoftEvent): ExternalCalendarEvent | null {
  if (!event.id || !event.start?.dateTime || !event.end?.dateTime) return null;
  const start = toIso(event.start.dateTime);
  const end = toIso(event.end.dateTime);
  return {
    id: event.id,
    title: event.subject ?? '',
    description: event.body?.content ?? null,
    startsAt: start,
    durationMinutes: Math.max(5, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)),
    alertEnabled: Boolean(event.isReminderOn),
    alertMinutes: event.isReminderOn ? event.reminderMinutesBeforeStart ?? 0 : null,
    updatedAt: event.lastModifiedDateTime ?? new Date().toISOString(),
    etag: event['@odata.etag'] ?? null,
  };
}

export const microsoftCalendarAdapter: CalendarProviderAdapter = {
  provider: 'microsoft',
  authorizationUrl(state) {
    const { clientId, redirectUri } = config();
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: SCOPES.join(' '), state });
    return `${AUTH_URL}?${params}`;
  },
  async exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = config();
    return tokenSet(await calendarFetch<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: SCOPES.join(' ') }),
    }));
  },
  async refreshAccessToken(refreshToken) {
    const { clientId, clientSecret, redirectUri } = config();
    return tokenSet(await calendarFetch<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, redirect_uri: redirectUri, grant_type: 'refresh_token', scope: SCOPES.join(' ') }),
    }));
  },
  async getAccount(accessToken): Promise<CalendarAccount> {
    const data = await calendarFetch<{ id: string; mail?: string; userPrincipalName?: string; displayName?: string }>(`${API_URL}/me?$select=id,mail,userPrincipalName,displayName`, { headers: headers(accessToken) });
    return { id: data.id, email: data.mail ?? data.userPrincipalName ?? null, name: data.displayName ?? null };
  },
  async listAgendas(accessToken): Promise<CalendarAgenda[]> {
    const data = await calendarFetch<{ value?: { id: string; name?: string; canEdit?: boolean; isDefaultCalendar?: boolean }[] }>(`${API_URL}/me/calendars?$select=id,name,canEdit,isDefaultCalendar`, { headers: headers(accessToken) });
    return (data.value ?? []).filter((item) => item.canEdit !== false).map((item) => ({ id: item.id, name: item.name ?? item.id, provider: 'microsoft', primary: Boolean(item.isDefaultCalendar), canWrite: true }));
  },
  async createEvent(accessToken, calendarId, event): Promise<CalendarEventResult> {
    const data = await calendarFetch<MicrosoftEvent>(`${API_URL}/me/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', headers: headers(accessToken), body: JSON.stringify(eventBody(event)) });
    return { id: data.id, updatedAt: data.lastModifiedDateTime ?? new Date().toISOString(), etag: data['@odata.etag'] ?? null };
  },
  async updateEvent(accessToken, calendarId, eventId, event): Promise<CalendarEventResult> {
    const data = await calendarFetch<MicrosoftEvent>(`${API_URL}/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', headers: headers(accessToken), body: JSON.stringify(eventBody(event)) });
    return { id: data.id, updatedAt: data.lastModifiedDateTime ?? new Date().toISOString(), etag: data['@odata.etag'] ?? null };
  },
  async deleteEvent(accessToken, calendarId, eventId) {
    try {
      await calendarFetch<unknown>(`${API_URL}/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers: headers(accessToken) });
    } catch (error) {
      if (!(error instanceof CalendarProviderError) || error.status !== 404) throw error;
    }
  },
  async getEvent(accessToken, calendarId, eventId) {
    try {
      return parseEvent(await calendarFetch<MicrosoftEvent>(`${API_URL}/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?$select=id,subject,body,start,end,isReminderOn,reminderMinutesBeforeStart,lastModifiedDateTime`, { headers: headers(accessToken) }));
    } catch (error) {
      if (error instanceof CalendarProviderError && error.status === 404) return null;
      throw error;
    }
  },
};
