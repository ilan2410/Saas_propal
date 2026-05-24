-- Migration : tranches de prix, destinations documents, catégories cadeau + installation

-- 1. Élargir le CHECK constraint sur categorie
ALTER TABLE public.catalogues_produits
  DROP CONSTRAINT IF EXISTS catalogues_produits_categorie_check;

ALTER TABLE public.catalogues_produits
  ADD CONSTRAINT catalogues_produits_categorie_check
  CHECK (categorie IN ('mobile', 'internet', 'fixe', 'cloud', 'equipement', 'autre', 'cadeau', 'installation'));

-- 2. Ajouter les nouvelles colonnes
ALTER TABLE public.catalogues_produits
  ADD COLUMN IF NOT EXISTS prix_par_tranche JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS destinations JSONB DEFAULT '{"proposition":true,"bdc_operateur":true,"bdc_materiel":true}'::jsonb;

-- 3. Initialiser destinations pour les produits existants qui n'en ont pas
UPDATE public.catalogues_produits
  SET destinations = '{"proposition":true,"bdc_operateur":true,"bdc_materiel":true}'::jsonb
  WHERE destinations IS NULL;
