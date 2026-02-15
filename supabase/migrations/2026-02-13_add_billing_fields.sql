ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS email_facturation TEXT,
ADD COLUMN IF NOT EXISTS adresse_ligne1_facturation TEXT,
ADD COLUMN IF NOT EXISTS adresse_ligne2_facturation TEXT,
ADD COLUMN IF NOT EXISTS ville_facturation TEXT,
ADD COLUMN IF NOT EXISTS code_postal_facturation TEXT,
ADD COLUMN IF NOT EXISTS pays_facturation TEXT,
ADD COLUMN IF NOT EXISTS telephone_facturation TEXT;

-- Migration des données existantes (si adresse_facturation est utilisé comme ligne 1)
UPDATE organizations
SET adresse_ligne1_facturation = adresse_facturation
WHERE adresse_ligne1_facturation IS NULL AND adresse_facturation IS NOT NULL;
