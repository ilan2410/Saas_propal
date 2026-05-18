alter table public.catalogues_produits
  add column if not exists prix_mensuel_remise numeric,
  add column if not exists libelle_remise text;
