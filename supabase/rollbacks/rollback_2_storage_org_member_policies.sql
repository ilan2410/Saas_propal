-- ==========================================
-- ROLLBACK de : 2026-08-25_storage_org_member_policies.sql
-- ==========================================
-- À EXÉCUTER EN PREMIER (avant rollback_1_organization_members.sql),
-- car ce fichier ne fait que remettre les policies Storage à leur état
-- d'origine (auth.uid() direct) — il ne touche pas à la fonction
-- is_org_member(), qui doit encore exister au moment où ce script tourne.
--
-- Remet les policies des buckets `documents`, `propositions` et `templates`
-- à l'état exact d'avant l'introduction des sous-comptes commerciaux
-- (copié depuis supabase/storage.sql).
--
-- ⚠️ Effet : après ce rollback, un commercial (organization_members) ne
-- pourra plus lire/écrire dans ces 3 buckets — seul le propriétaire
-- (auth.uid() = organization_id) le pourra, comme avant cette fonctionnalité.

-- ==========================================
-- BUCKET: documents
-- ==========================================

DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can read their own documents" ON storage.objects;
CREATE POLICY "Users can read their own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ==========================================
-- BUCKET: propositions
-- ==========================================

DROP POLICY IF EXISTS "Users can read their own propositions" ON storage.objects;
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

-- ==========================================
-- BUCKET: templates
-- ==========================================

DROP POLICY IF EXISTS "Users can upload their own templates" ON storage.objects;
CREATE POLICY "Users can upload their own templates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can read their own templates" ON storage.objects;
CREATE POLICY "Users can read their own templates"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own templates" ON storage.objects;
CREATE POLICY "Users can update their own templates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own templates" ON storage.objects;
CREATE POLICY "Users can delete their own templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'templates' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
