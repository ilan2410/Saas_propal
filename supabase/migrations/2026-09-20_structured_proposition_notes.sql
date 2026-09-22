ALTER TABLE public.proposition_notes
ADD COLUMN IF NOT EXISTS structure_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.proposition_notes
DROP CONSTRAINT IF EXISTS proposition_notes_check;

ALTER TABLE public.proposition_notes
DROP CONSTRAINT IF EXISTS proposition_notes_structure_version_check;

ALTER TABLE public.proposition_notes
ADD CONSTRAINT proposition_notes_structure_version_check
CHECK (structure_version IN (1, 2));

ALTER TABLE public.proposition_notes
DROP CONSTRAINT IF EXISTS proposition_notes_structure_check;

ALTER TABLE public.proposition_notes
ADD CONSTRAINT proposition_notes_structure_check
CHECK (
  structure_version = 1
  OR (
    structure_version = 2
    AND NULLIF(BTRIM(COALESCE(title, '')), '') IS NOT NULL
    AND content IS NULL
    AND (
      (kind = 'note'
        AND starts_at IS NULL
        AND timezone IS NULL
        AND duration_minutes IS NULL
        AND alert_enabled = false
        AND alert_minutes IS NULL)
      OR
      (kind = 'reminder'
        AND starts_at IS NOT NULL
        AND timezone IS NOT NULL
        AND duration_minutes BETWEEN 5 AND 1440
        AND (alert_enabled = false OR alert_minutes BETWEEN 0 AND 40320))
    )
  )
);

CREATE TABLE IF NOT EXISTS public.proposition_note_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.proposition_notes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  content TEXT NOT NULL CHECK (
    NULLIF(BTRIM(content), '') IS NOT NULL
    AND POSITION(E'\n' IN content) = 0
    AND POSITION(E'\r' IN content) = 0
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposition_note_entries_note
  ON public.proposition_note_entries(note_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_proposition_note_entries_author
  ON public.proposition_note_entries(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposition_note_entries_org
  ON public.proposition_note_entries(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS update_proposition_note_entries_updated_at ON public.proposition_note_entries;
CREATE TRIGGER update_proposition_note_entries_updated_at
BEFORE UPDATE ON public.proposition_note_entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.touch_proposition_note_from_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.proposition_notes
  SET updated_at = NOW()
  WHERE id = COALESCE(NEW.note_id, OLD.note_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS touch_proposition_note_after_entry_change ON public.proposition_note_entries;
CREATE TRIGGER touch_proposition_note_after_entry_change
AFTER INSERT OR UPDATE OR DELETE ON public.proposition_note_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_proposition_note_from_entry();

ALTER TABLE public.proposition_note_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view permitted proposition note entries" ON public.proposition_note_entries;
CREATE POLICY "Users can view permitted proposition note entries"
ON public.proposition_note_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.proposition_notes n
    WHERE n.id = note_id
      AND (
        n.author_user_id = auth.uid()
        OR n.organization_id = auth.uid()
        OR (auth.jwt() ->> 'role') = 'admin'
      )
  )
);

DROP POLICY IF EXISTS "Users can create proposition note entries" ON public.proposition_note_entries;
CREATE POLICY "Users can create proposition note entries"
ON public.proposition_note_entries FOR INSERT
WITH CHECK (
  author_user_id = auth.uid()
  AND public.is_org_member(organization_id)
  AND EXISTS (
    SELECT 1
    FROM public.proposition_notes n
    WHERE n.id = note_id
      AND n.organization_id = organization_id
      AND (n.author_user_id = auth.uid() OR n.organization_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authors and owners can update proposition note entries" ON public.proposition_note_entries;
CREATE POLICY "Authors and owners can update proposition note entries"
ON public.proposition_note_entries FOR UPDATE
USING (
  author_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.proposition_notes n
    WHERE n.id = note_id AND n.organization_id = auth.uid()
  )
)
WITH CHECK (
  author_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.proposition_notes n
    WHERE n.id = note_id AND n.organization_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authors and owners can delete proposition note entries" ON public.proposition_note_entries;
CREATE POLICY "Authors and owners can delete proposition note entries"
ON public.proposition_note_entries FOR DELETE
USING (
  author_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.proposition_notes n
    WHERE n.id = note_id AND n.organization_id = auth.uid()
  )
);
