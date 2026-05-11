ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS is_multisite BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS parent_proposition_id UUID REFERENCES propositions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS site_nom VARCHAR(255);

COMMENT ON COLUMN propositions.parent_proposition_id IS
'Pour les propositions clonées depuis un multisite, référence la proposition parente dont les données SA ont été extraites.';
COMMENT ON COLUMN propositions.site_nom IS
'Nom du site pour les propositions multisite (ex: Paris, Lyon).';
