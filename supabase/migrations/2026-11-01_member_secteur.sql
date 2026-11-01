-- Secteur d'un commercial (organisations « mixte » uniquement) : limite ses accès
-- (catalogue, templates, propositions) à ce secteur. NULL = tous les secteurs.
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS secteur TEXT;

ALTER TABLE public.organization_members
ADD CONSTRAINT organization_members_secteur_check CHECK (secteur IS NULL OR secteur IN ('telephonie', 'bureautique'));
