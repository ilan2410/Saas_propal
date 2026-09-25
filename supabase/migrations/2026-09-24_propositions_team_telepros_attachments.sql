ALTER TABLE public.propositions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

UPDATE public.propositions
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.propositions
ALTER COLUMN updated_at SET DEFAULT NOW(),
ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS update_propositions_updated_at ON public.propositions;
CREATE TRIGGER update_propositions_updated_at
BEFORE UPDATE ON public.propositions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.teleprospecteurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prenom TEXT NOT NULL DEFAULT '',
  nom TEXT NOT NULL DEFAULT '',
  email TEXT,
  telephone TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NULLIF(BTRIM(prenom || ' ' || nom), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_teleprospecteurs_org
ON public.teleprospecteurs(organization_id, actif, nom, prenom);

DROP TRIGGER IF EXISTS update_teleprospecteurs_updated_at ON public.teleprospecteurs;
CREATE TRIGGER update_teleprospecteurs_updated_at
BEFORE UPDATE ON public.teleprospecteurs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.propositions
ADD COLUMN IF NOT EXISTS teleprospecteur_id UUID REFERENCES public.teleprospecteurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propositions_teleprospecteur
ON public.propositions(teleprospecteur_id);
CREATE INDEX IF NOT EXISTS idx_propositions_updated
ON public.propositions(updated_at DESC);

CREATE OR REPLACE FUNCTION public.validate_proposition_teleprospecteur()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.teleprospecteur_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.teleprospecteurs t
    WHERE t.id = NEW.teleprospecteur_id
      AND t.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Le téléprospecteur doit appartenir à la même organisation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_proposition_teleprospecteur_assignment ON public.propositions;
CREATE TRIGGER validate_proposition_teleprospecteur_assignment
BEFORE INSERT OR UPDATE OF teleprospecteur_id, organization_id ON public.propositions
FOR EACH ROW EXECUTE FUNCTION public.validate_proposition_teleprospecteur();

CREATE TABLE IF NOT EXISTS public.proposition_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  proposition_id UUID NOT NULL REFERENCES public.propositions(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  storage_provider TEXT NOT NULL DEFAULT 'supabase' CHECK (storage_provider IN ('supabase', 's3')),
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_provider, storage_bucket, storage_key)
);

CREATE INDEX IF NOT EXISTS idx_proposition_attachments_proposition
ON public.proposition_attachments(proposition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposition_attachments_org
ON public.proposition_attachments(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, preference_key),
  CHECK (char_length(preference_key) BETWEEN 1 AND 100)
);

DROP TRIGGER IF EXISTS update_user_ui_preferences_updated_at ON public.user_ui_preferences;
CREATE TRIGGER update_user_ui_preferences_updated_at
BEFORE UPDATE ON public.user_ui_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.touch_proposition_from_related_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_proposition_id UUID;
BEGIN
  target_proposition_id := COALESCE(NEW.proposition_id, OLD.proposition_id);
  UPDATE public.propositions
  SET updated_at = NOW()
  WHERE id = target_proposition_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS touch_proposition_after_attachment_change ON public.proposition_attachments;
CREATE TRIGGER touch_proposition_after_attachment_change
AFTER INSERT OR UPDATE OR DELETE ON public.proposition_attachments
FOR EACH ROW EXECUTE FUNCTION public.touch_proposition_from_related_activity();

DROP TRIGGER IF EXISTS touch_proposition_after_note_change ON public.proposition_notes;
CREATE TRIGGER touch_proposition_after_note_change
AFTER INSERT OR UPDATE OR DELETE ON public.proposition_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_proposition_from_related_activity();

ALTER TABLE public.teleprospecteurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposition_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization users can view teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Organization users can view teleprospecteurs"
ON public.teleprospecteurs FOR SELECT
USING (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can create teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can create teleprospecteurs"
ON public.teleprospecteurs FOR INSERT
WITH CHECK (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can update teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can update teleprospecteurs"
ON public.teleprospecteurs FOR UPDATE
USING (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin')
WITH CHECK (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can delete teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can delete teleprospecteurs"
ON public.teleprospecteurs FOR DELETE
USING (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Organization users can view proposition attachments" ON public.proposition_attachments;
CREATE POLICY "Organization users can view proposition attachments"
ON public.proposition_attachments FOR SELECT
USING (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Users manage their UI preferences" ON public.user_ui_preferences;
CREATE POLICY "Users manage their UI preferences"
ON public.user_ui_preferences FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('proposition-attachments', 'proposition-attachments', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 52428800;
