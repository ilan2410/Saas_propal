ALTER TABLE public.proposition_templates
ADD COLUMN IF NOT EXISTS secteur TEXT;

UPDATE public.proposition_templates AS t
SET secteur = CASE WHEN o.secteur = 'bureautique' THEN 'bureautique' ELSE 'telephonie' END
FROM public.organizations AS o
WHERE t.organization_id = o.id AND t.secteur IS NULL;

ALTER TABLE public.proposition_templates
ALTER COLUMN secteur SET DEFAULT 'telephonie',
ALTER COLUMN secteur SET NOT NULL;

ALTER TABLE public.proposition_templates
ADD CONSTRAINT proposition_templates_secteur_check CHECK (secteur IN ('telephonie', 'bureautique'));

ALTER TABLE public.catalogues_produits
ADD COLUMN IF NOT EXISTS secteur_catalogue TEXT NOT NULL DEFAULT 'telephonie';

ALTER TABLE public.catalogues_produits
ADD CONSTRAINT catalogues_produits_secteur_catalogue_check CHECK (secteur_catalogue IN ('telephonie', 'bureautique'));

UPDATE public.catalogues_produits AS p
SET secteur_catalogue = 'bureautique'
FROM public.organizations AS o
WHERE p.organization_id = o.id AND o.secteur = 'bureautique'
  AND p.secteur_catalogue = 'telephonie';
