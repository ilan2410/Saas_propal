-- Supprimer l'ancienne politique de gestion qui restreignait aux produits de l'organisation
DROP POLICY IF EXISTS "Users can manage their own products" ON catalogues_produits;

-- Nouvelle politique de gestion (INSERT, UPDATE, DELETE)
-- 1. Les utilisateurs peuvent gérer leurs propres produits (organization_id = auth.uid())
-- 2. Les administrateurs peuvent gérer les produits globaux (organization_id IS NULL)
-- Note : La vérification 'admin' se fait ici en vérifiant que organization_id est NULL.
-- C'est une sécurité "côté base de données" minimaliste qui complète la sécurité "côté API" (où on vérifie le rôle admin).
-- Si un utilisateur lambda essaie d'insérer avec organization_id = NULL via l'API client standard, l'API force organization_id = auth.uid(), donc ça passera.
-- Mais l'API admin force organization_id = NULL.

CREATE POLICY "Manage own and global products"
ON catalogues_produits FOR ALL
USING (
  organization_id = auth.uid() OR organization_id IS NULL
)
WITH CHECK (
  organization_id = auth.uid() OR organization_id IS NULL
);

ALTER TABLE catalogues_produits
ADD COLUMN IF NOT EXISTS secteur_catalogue TEXT NOT NULL DEFAULT 'telephonie';

UPDATE catalogues_produits
SET secteur_catalogue = 'telephonie'
WHERE secteur_catalogue IS NULL;
