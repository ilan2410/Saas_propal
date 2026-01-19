-- ==========================================
-- Ajout du mode brouillon + reprise
-- ==========================================

-- 1) Ajouter une colonne current_step (1..5)
ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 1;

UPDATE propositions
SET current_step = 1
WHERE current_step IS NULL;

-- 2) Étendre la contrainte de statut pour inclure 'draft' et 'extracted'
DO $$
BEGIN
  -- Supprimer la contrainte CHECK existante si elle existe
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'propositions_statut_check'
  ) THEN
    ALTER TABLE propositions DROP CONSTRAINT propositions_statut_check;
  END IF;

  -- Recréer la contrainte avec les statuts attendus
  ALTER TABLE propositions
  ADD CONSTRAINT propositions_statut_check
  CHECK (statut IN ('draft', 'processing', 'ready', 'extracted', 'exported', 'error'));
END $$;
