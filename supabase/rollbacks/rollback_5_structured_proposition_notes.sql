-- ==========================================
-- ROLLBACK de : 2026-09-20_structured_proposition_notes.sql
-- ==========================================
-- DESTRUCTEUR : supprime les notes structurées et toutes leurs mini-notes.
-- Les notes historiques en structure_version = 1 sont conservées.

BEGIN;

DELETE FROM public.proposition_notes
WHERE structure_version = 2;

DROP TABLE IF EXISTS public.proposition_note_entries CASCADE;
DROP FUNCTION IF EXISTS public.touch_proposition_note_from_entry();

ALTER TABLE public.proposition_notes
DROP CONSTRAINT IF EXISTS proposition_notes_structure_check;
ALTER TABLE public.proposition_notes
DROP CONSTRAINT IF EXISTS proposition_notes_structure_version_check;
ALTER TABLE public.proposition_notes
DROP COLUMN IF EXISTS structure_version;

ALTER TABLE public.proposition_notes
ADD CONSTRAINT proposition_notes_check
CHECK (
  (kind = 'note' AND NULLIF(BTRIM(COALESCE(content, '')), '') IS NOT NULL)
  OR
  (kind = 'reminder'
    AND NULLIF(BTRIM(COALESCE(title, '')), '') IS NOT NULL
    AND starts_at IS NOT NULL
    AND timezone IS NOT NULL
    AND duration_minutes BETWEEN 5 AND 1440
    AND (alert_enabled = false OR alert_minutes BETWEEN 0 AND 40320))
);

COMMIT;
