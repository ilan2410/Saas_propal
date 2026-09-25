DROP TRIGGER IF EXISTS touch_proposition_after_note_change ON public.proposition_notes;
DROP TRIGGER IF EXISTS touch_proposition_after_attachment_change ON public.proposition_attachments;
DROP FUNCTION IF EXISTS public.touch_proposition_from_related_activity();

DROP TABLE IF EXISTS public.user_ui_preferences;
DROP TABLE IF EXISTS public.proposition_attachments;

DROP TRIGGER IF EXISTS validate_proposition_teleprospecteur_assignment ON public.propositions;
DROP FUNCTION IF EXISTS public.validate_proposition_teleprospecteur();
ALTER TABLE public.propositions DROP COLUMN IF EXISTS teleprospecteur_id;
DROP TABLE IF EXISTS public.teleprospecteurs;

DROP TRIGGER IF EXISTS update_propositions_updated_at ON public.propositions;
ALTER TABLE public.propositions DROP COLUMN IF EXISTS updated_at;

DELETE FROM storage.buckets
WHERE id = 'proposition-attachments'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'proposition-attachments'
  );
