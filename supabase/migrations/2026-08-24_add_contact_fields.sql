ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS contact_prenom TEXT,
ADD COLUMN IF NOT EXISTS contact_nom TEXT,
ADD COLUMN IF NOT EXISTS telephone_fixe TEXT,
ADD COLUMN IF NOT EXISTS telephone_mobile TEXT;

-- Si une exécution précédente de cette migration a déjà créé l'ancienne colonne
-- "telephone" (téléphone fixe), on migre ses valeurs puis on la supprime.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'telephone'
  ) THEN
    UPDATE organizations
    SET telephone_fixe = telephone
    WHERE telephone_fixe IS NULL AND telephone IS NOT NULL;

    ALTER TABLE organizations DROP COLUMN telephone;
  END IF;
END $$;
