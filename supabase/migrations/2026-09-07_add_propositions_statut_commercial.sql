-- ==========================================
-- Statut commercial des propositions
-- ==========================================
-- Axe distinct du `statut` technique (chaîne de production).
-- Défini manuellement par l'utilisateur une fois la proposition exportée.
--   en_cours (défaut) | en_attente_client | signee | perdue

ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS statut_commercial VARCHAR(20) DEFAULT 'en_cours';

UPDATE propositions
SET statut_commercial = 'en_cours'
WHERE statut_commercial IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'propositions_statut_commercial_check'
  ) THEN
    ALTER TABLE propositions DROP CONSTRAINT propositions_statut_commercial_check;
  END IF;

  ALTER TABLE propositions
  ADD CONSTRAINT propositions_statut_commercial_check
  CHECK (statut_commercial IN ('en_cours', 'en_attente_client', 'signee', 'perdue'));
END $$;

CREATE INDEX IF NOT EXISTS idx_propositions_statut_commercial
ON propositions(statut_commercial);
