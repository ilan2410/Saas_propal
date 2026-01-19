-- Ajouter le statut 'canceled' aux transactions Stripe

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname
  INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid
  WHERE c.conrelid = 'public.stripe_transactions'::regclass
    AND c.contype = 'c'
    AND a.attname = 'statut'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stripe_transactions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.stripe_transactions
  ADD CONSTRAINT stripe_transactions_statut_check
  CHECK (statut IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled'));
