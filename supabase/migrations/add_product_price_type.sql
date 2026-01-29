-- Migration pour ajouter le type de fréquence et le prix de vente
ALTER TABLE catalogues_produits
ADD COLUMN IF NOT EXISTS type_frequence VARCHAR(20) DEFAULT 'mensuel' CHECK (type_frequence IN ('mensuel', 'unique')),
ADD COLUMN IF NOT EXISTS prix_vente DECIMAL(10,2);

-- Rendre prix_mensuel optionnel
ALTER TABLE catalogues_produits
ALTER COLUMN prix_mensuel DROP NOT NULL;
