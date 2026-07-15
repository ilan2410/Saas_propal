-- Stocke l'ID de la facture Stripe générée pour une recharge de crédits

ALTER TABLE public.stripe_transactions
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
