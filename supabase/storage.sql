-- ==========================================
-- CONFIGURATION SUPABASE STORAGE
-- Buckets et Policies pour les fichiers
-- ==========================================

-- ==========================================
-- CRÉATION DES BUCKETS
-- ==========================================

-- Bucket pour les templates master (jamais modifiés)
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket pour les propositions générées (fichiers modifiés)
INSERT INTO storage.buckets (id, name, public)
VALUES ('propositions', 'propositions', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket pour les documents source uploadés (factures, contrats)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- POLICIES POUR LE BUCKET: templates
-- ==========================================

-- Policy: Les utilisateurs peuvent uploader leurs propres templates
CREATE POLICY "Users can upload their own templates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Les utilisateurs peuvent lire leurs propres templates
CREATE POLICY "Users can read their own templates"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Les utilisateurs peuvent mettre à jour leurs propres templates
CREATE POLICY "Users can update their own templates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Les utilisateurs peuvent supprimer leurs propres templates
CREATE POLICY "Users can delete their own templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ==========================================
-- POLICIES POUR LE BUCKET: propositions
-- ==========================================

-- Policy: Les utilisateurs peuvent lire leurs propres propositions
CREATE POLICY "Users can read their own propositions"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'propositions' AND
  EXISTS (
    SELECT 1 FROM propositions
    WHERE propositions.duplicated_template_url LIKE '%' || name
    AND propositions.organization_id = auth.uid()
  )
);

-- Policy: Le système peut créer des propositions (via service role)
CREATE POLICY "Service can create propositions"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'propositions'
);

-- ==========================================
-- POLICIES POUR LE BUCKET: documents
-- ==========================================

-- Policy: Les utilisateurs peuvent uploader leurs propres documents
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Les utilisateurs peuvent lire leurs propres documents
CREATE POLICY "Users can read their own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Les utilisateurs peuvent supprimer leurs propres documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ==========================================
-- CONFIGURATION DES LIMITES
-- ==========================================

-- Limite de taille des fichiers par bucket (à configurer dans le dashboard Supabase)
-- templates: 50 MB max
-- propositions: 50 MB max
-- documents: 50 MB max

-- Note: Ces limites sont configurables dans le dashboard Supabase
-- Settings > Storage > Bucket settings
