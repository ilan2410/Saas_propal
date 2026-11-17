-- A confirmed SA is immutable across every writer, including service-role jobs.
-- Billing identity remains editable for the proposed offer, as for SP variants.
CREATE OR REPLACE FUNCTION public.preserve_confirmed_sa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  billing jsonb;
BEGIN
  IF OLD.filled_data #>> '{_sa_confirmation,confirmed_at}' IS NOT NULL THEN
    IF NEW.extracted_data IS DISTINCT FROM OLD.extracted_data
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.statut = 'processing' THEN
      RAISE EXCEPTION 'La SA est confirmée et ne peut plus être modifiée.'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO billing
    FROM jsonb_each(COALESCE(NEW.filled_data::jsonb, '{}'::jsonb))
    WHERE key = 'client' OR key LIKE 'client.%';

    -- Keep the authoritative snapshot, including private extraction evidence.
    -- SP saves may send a sanitized copy; that must never replace the snapshot.
    NEW.filled_data := OLD.filled_data::jsonb || billing;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_confirmed_sa ON public.propositions;
CREATE TRIGGER preserve_confirmed_sa
BEFORE UPDATE ON public.propositions
FOR EACH ROW EXECUTE FUNCTION public.preserve_confirmed_sa();
