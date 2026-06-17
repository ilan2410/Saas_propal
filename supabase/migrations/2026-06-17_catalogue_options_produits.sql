-- Migration : options de produits (produits liés proposés en option dans le questionnaire SP)

ALTER TABLE public.catalogues_produits
  ADD COLUMN IF NOT EXISTS options_produits_ids JSONB DEFAULT NULL;

COMMENT ON COLUMN public.catalogues_produits.options_produits_ids IS
  'Tableau d''IDs de produits du catalogue proposés comme options lorsque ce produit est sélectionné dans le questionnaire SP';
