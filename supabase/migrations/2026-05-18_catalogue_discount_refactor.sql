-- Migration pour remplacer prix_mensuel_remise/libelle_remise par remise_type/remise_valeur

-- Ajouter les nouveaux champs
alter table public.catalogues_produits
  add column if not exists remise_type text check (remise_type in ('fixe', 'pourcentage')),
  add column if not exists remise_valeur numeric;

-- Migrer les données existantes : convertir prix_mensuel_remise en remise_type='fixe'
update public.catalogues_produits
set remise_type = 'fixe',
    remise_valeur = prix_mensuel_remise
where prix_mensuel_remise is not null;

-- Supprimer les anciens champs
alter table public.catalogues_produits
  drop column if exists prix_mensuel_remise,
  drop column if exists libelle_remise;
