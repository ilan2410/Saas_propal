-- Modifier la table catalogues_produits pour supporter les produits globaux (admin)
-- Si organization_id est NULL, c'est un produit global (admin)
ALTER TABLE catalogues_produits
ALTER COLUMN organization_id DROP NOT NULL;

-- Index pour accélérer les recherches de produits globaux
CREATE INDEX IF NOT EXISTS idx_catalogue_global ON catalogues_produits(organization_id) WHERE organization_id IS NULL;

-- Politique de sécurité : Tout le monde peut voir les produits globaux (admin)
DROP POLICY IF EXISTS "Users can view base products and their own" ON catalogues_produits;

CREATE POLICY "Users can view own and global products"
ON catalogues_produits FOR SELECT
USING (
  organization_id = auth.uid() OR organization_id IS NULL
);

-- Politique de sécurité : Seuls les admins peuvent modifier les produits globaux
-- Note: Supabase n'a pas de rôle 'admin' natif dans auth.users, on suppose ici une vérification via métadonnées ou table profile
-- Pour simplifier ici, on autorise l'insert/update si organization_id est NULL (à sécuriser via API side ou trigger)
-- Dans notre cas, l'API admin vérifiera le rôle avant d'insérer avec organization_id = NULL
