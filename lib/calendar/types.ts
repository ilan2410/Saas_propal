export type CalendarProvider = 'google' | 'microsoft';
export type PropositionNoteKind = 'note' | 'reminder';
export type CalendarSyncStatus = 'pending' | 'synced' | 'error' | 'disconnected';

export interface PropositionNoteEntry {
  id: string;
  note_id: string;
  organization_id: string;
  author_user_id: string;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface PropositionNote {
  id: string;
  organization_id: string;
  proposition_id: string;
  author_user_id: string;
  structure_version: number;
  kind: PropositionNoteKind;
  title: string | null;
  content: string | null;
  starts_at: string | null;
  timezone: string | null;
  duration_minutes: number | null;
  alert_enabled: boolean;
  alert_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarConnection {
  id: string;
  organization_id: string;
  user_id: string;
  provider: CalendarProvider;
  provider_account_id: string;
  account_email: string | null;
  account_name: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  granted_scopes: string[];
  status: 'connected' | 'expired' | 'error' | 'disconnected';
  last_error: string | null;
}

export interface CalendarAgenda {
  id: string;
  name: string;
  provider: CalendarProvider;
  primary: boolean;
  canWrite: boolean;
  timezone?: string;
}

export interface CalendarTarget {
  connectionId: string;
  provider: CalendarProvider;
  calendarId: string;
  calendarName?: string;
}

export interface ExternalCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  alertEnabled: boolean;
  alertMinutes: number | null;
  updatedAt: string;
  etag: string | null;
  deleted?: boolean;
}

export interface CalendarEventInput {
  noteId: string;
  title: string;
  description: string;
  startsAt: string;
  timezone: string;
  durationMinutes: number;
  alertEnabled: boolean;
  alertMinutes: number | null;
}

export interface CalendarEventResult {
  id: string;
  updatedAt: string;
  etag: string | null;
}

export interface CalendarTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scopes: string[];
}

export interface CalendarAccount {
  id: string;
  email: string | null;
  name: string | null;
}

export interface CalendarProviderAdapter {
  provider: CalendarProvider;
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<CalendarTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<CalendarTokenSet>;
  getAccount(accessToken: string): Promise<CalendarAccount>;
  listAgendas(accessToken: string): Promise<CalendarAgenda[]>;
  createEvent(accessToken: string, calendarId: string, event: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(accessToken: string, calendarId: string, eventId: string, event: CalendarEventInput): Promise<CalendarEventResult>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  getEvent(accessToken: string, calendarId: string, eventId: string): Promise<ExternalCalendarEvent | null>;
  revoke?(accessToken: string): Promise<void>;
}
