-- Ajouter la colonne image_url
ALTER TABLE catalogues_produits ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Créer le bucket de stockage pour les images du catalogue
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogue-images', 'catalogue-images', true)
ON CONFLICT (id) DO NOTHING;

-- Politiques de sécurité pour le stockage
-- Accès public en lecture
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'catalogue-images' );

-- Upload pour les utilisateurs authentifiés
DROP POLICY IF EXISTS "Auth Users Upload" ON storage.objects;
CREATE POLICY "Auth Users Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'catalogue-images' AND auth.role() = 'authenticated' );

-- Update pour les utilisateurs authentifiés (pour écraser/modifier)
DROP POLICY IF EXISTS "Auth Users Update" ON storage.objects;
CREATE POLICY "Auth Users Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'catalogue-images' AND auth.role() = 'authenticated' );

-- Suppression pour les utilisateurs authentifiés
DROP POLICY IF EXISTS "Auth Users Delete" ON storage.objects;
CREATE POLICY "Auth Users Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'catalogue-images' AND auth.role() = 'authenticated' );
