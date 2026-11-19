-- Préférence de contact : le demandeur ne renseigne que l'email OU le téléphone.
BEGIN;

ALTER TABLE public.contact_requests
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS contact_preference text NOT NULL DEFAULT 'email'
    CHECK (contact_preference IN ('email', 'phone'));

ALTER TABLE public.contact_requests
  ADD CONSTRAINT contact_requests_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL);

COMMIT;
