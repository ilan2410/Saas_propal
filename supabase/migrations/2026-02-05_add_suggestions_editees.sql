-- Ajouter le champ suggestions_editees à la table propositions
ALTER TABLE propositions 
ADD COLUMN IF NOT EXISTS suggestions_editees JSONB DEFAULT NULL;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_propositions_suggestions_editees 
ON propositions USING GIN (suggestions_editees);
