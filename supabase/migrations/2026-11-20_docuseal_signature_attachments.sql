-- Signature électronique : le PDF signé et le journal d'audit sont ajoutés une
-- seule fois aux pièces jointes de la proposition (une suppression volontaire
-- par l'utilisateur n'est pas annulée ensuite).
ALTER TABLE public.proposition_signatures
  ADD COLUMN IF NOT EXISTS attachments_added_at timestamptz;
