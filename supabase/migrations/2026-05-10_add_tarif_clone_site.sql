ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS tarif_clone_site DECIMAL(10,2) DEFAULT 1.00;

COMMENT ON COLUMN organizations.tarif_clone_site IS
'Coût en crédits pour générer une proposition supplémentaire à partir d une SA multisite déjà extraite (clone par site).';
