-- Ajout sp_questions dans organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS sp_questions JSONB DEFAULT '[]'::jsonb;

-- Ajout dans propositions
ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS suggestions_sp_completes JSONB DEFAULT NULL;

ALTER TABLE propositions
ADD COLUMN IF NOT EXISTS sp_reponses JSONB DEFAULT '[]'::jsonb;
