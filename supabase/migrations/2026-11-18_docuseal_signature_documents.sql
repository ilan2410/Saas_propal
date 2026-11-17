-- Signature électronique : variante SP envoyée et annexes jointes à l'envoi.
BEGIN;

ALTER TABLE public.proposition_signatures
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.proposition_sp_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_name text CHECK (char_length(variant_name) <= 80),
  ADD COLUMN IF NOT EXISTS annex_names text[] NOT NULL DEFAULT '{}';

COMMIT;
