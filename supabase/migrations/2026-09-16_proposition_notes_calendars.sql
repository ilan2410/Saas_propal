CREATE TABLE IF NOT EXISTS public.proposition_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  proposition_id UUID NOT NULL REFERENCES public.propositions(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'reminder')),
  title TEXT,
  content TEXT,
  starts_at TIMESTAMPTZ,
  timezone TEXT,
  duration_minutes INTEGER,
  alert_enabled BOOLEAN NOT NULL DEFAULT false,
  alert_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'note' AND NULLIF(BTRIM(COALESCE(content, '')), '') IS NOT NULL)
    OR
    (kind = 'reminder'
      AND NULLIF(BTRIM(COALESCE(title, '')), '') IS NOT NULL
      AND starts_at IS NOT NULL
      AND timezone IS NOT NULL
      AND duration_minutes BETWEEN 5 AND 1440
      AND (alert_enabled = false OR alert_minutes BETWEEN 0 AND 40320))
  )
);

CREATE INDEX IF NOT EXISTS idx_proposition_notes_proposition
  ON public.proposition_notes(proposition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposition_notes_author
  ON public.proposition_notes(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposition_notes_org
  ON public.proposition_notes(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS update_proposition_notes_updated_at ON public.proposition_notes;
CREATE TRIGGER update_proposition_notes_updated_at
BEFORE UPDATE ON public.proposition_notes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_calendar_user_settings_updated_at ON public.calendar_user_settings;
CREATE TRIGGER update_calendar_user_settings_updated_at
BEFORE UPDATE ON public.calendar_user_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_id TEXT NOT NULL,
  account_email TEXT,
  account_name TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'error', 'disconnected')),
  last_error TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_org
  ON public.calendar_connections(organization_id, user_id);

DROP TRIGGER IF EXISTS update_calendar_connections_updated_at ON public.calendar_connections;
CREATE TRIGGER update_calendar_connections_updated_at
BEFORE UPDATE ON public.calendar_connections
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_event_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.proposition_notes(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.calendar_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  calendar_id TEXT NOT NULL,
  calendar_name TEXT,
  external_event_id TEXT,
  external_updated_at TIMESTAMPTZ,
  external_etag TEXT,
  last_synced_note_updated_at TIMESTAMPTZ,
  last_synced_hash TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error', 'disconnected')),
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (note_id, provider, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_links_event
  ON public.calendar_event_links(provider, calendar_id, external_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_links_retry
  ON public.calendar_event_links(sync_status, next_retry_at)
  WHERE sync_status IN ('pending', 'error');

DROP TRIGGER IF EXISTS update_calendar_event_links_updated_at ON public.calendar_event_links;
CREATE TRIGGER update_calendar_event_links_updated_at
BEFORE UPDATE ON public.calendar_event_links
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  calendar_id TEXT NOT NULL,
  external_subscription_id TEXT NOT NULL,
  external_resource_id TEXT,
  client_state TEXT NOT NULL,
  sync_cursor TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'renewing', 'expired', 'error')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, provider, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_expiration
  ON public.calendar_subscriptions(status, expires_at);

DROP TRIGGER IF EXISTS update_calendar_subscriptions_updated_at ON public.calendar_subscriptions;
CREATE TRIGGER update_calendar_subscriptions_updated_at
BEFORE UPDATE ON public.calendar_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.calendar_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, calendar_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_deletion_jobs_retry
  ON public.calendar_deletion_jobs(next_retry_at);

ALTER TABLE public.proposition_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_deletion_jobs ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON public.calendar_connections FROM authenticated;
GRANT SELECT (
  id,
  organization_id,
  user_id,
  provider,
  provider_account_id,
  account_email,
  account_name,
  status,
  last_error,
  connected_at,
  disconnected_at,
  created_at,
  updated_at
) ON public.calendar_connections TO authenticated;

DROP POLICY IF EXISTS "Users can view permitted proposition notes" ON public.proposition_notes;
CREATE POLICY "Users can view permitted proposition notes"
ON public.proposition_notes FOR SELECT
USING (
  organization_id = auth.uid()
  OR author_user_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can create their proposition notes" ON public.proposition_notes;
CREATE POLICY "Users can create their proposition notes"
ON public.proposition_notes FOR INSERT
WITH CHECK (
  author_user_id = auth.uid()
  AND public.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1
    FROM public.propositions p
    WHERE p.id = proposition_id
      AND p.organization_id = organization_id
      AND (
        organization_id = auth.uid()
        OR p.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.organization_members m
          JOIN public.organizations o ON o.id = m.organization_id
          WHERE m.user_id = auth.uid()
            AND m.organization_id = organization_id
            AND m.actif = true
            AND COALESCE(
              (m.permissions_override ->> 'view_all_propositions')::boolean,
              (o.commercial_default_permissions ->> 'view_all_propositions')::boolean,
              false
            ) = true
        )
      )
  )
);

DROP POLICY IF EXISTS "Authors and owners can update proposition notes" ON public.proposition_notes;
CREATE POLICY "Authors and owners can update proposition notes"
ON public.proposition_notes FOR UPDATE
USING (author_user_id = auth.uid() OR organization_id = auth.uid())
WITH CHECK (author_user_id = auth.uid() OR organization_id = auth.uid());

DROP POLICY IF EXISTS "Authors and owners can delete proposition notes" ON public.proposition_notes;
CREATE POLICY "Authors and owners can delete proposition notes"
ON public.proposition_notes FOR DELETE
USING (author_user_id = auth.uid() OR organization_id = auth.uid());

DROP POLICY IF EXISTS "Users manage their calendar settings" ON public.calendar_user_settings;
CREATE POLICY "Users manage their calendar settings"
ON public.calendar_user_settings FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users view their calendar connections" ON public.calendar_connections;
CREATE POLICY "Users view their calendar connections"
ON public.calendar_connections FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users view permitted calendar links" ON public.calendar_event_links;
CREATE POLICY "Users view permitted calendar links"
ON public.calendar_event_links FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.proposition_notes n
    WHERE n.id = note_id
      AND (n.author_user_id = auth.uid() OR n.organization_id = auth.uid())
  )
);
