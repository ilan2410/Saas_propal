-- Annule 2026-09-30_storage_orphans_and_rls_fix.sql.
-- Attention : restaurer les anciennes policies reintroduit le cast uuid non
-- protege, qui fait echouer toute suppression sur un chemin `generated/`.

DROP FUNCTION IF EXISTS public.admin_orphan_files(UUID);
DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org(UUID);
DROP FUNCTION IF EXISTS public.admin_storage_classify(UUID);

DROP POLICY IF EXISTS "Users can upload their own templates" ON storage.objects;
CREATE POLICY "Users can upload their own templates"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'templates' AND is_org_member(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "Users can read their own templates" ON storage.objects;
CREATE POLICY "Users can read their own templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'templates' AND is_org_member(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "Users can update their own templates" ON storage.objects;
CREATE POLICY "Users can update their own templates"
ON storage.objects FOR UPDATE
USING (bucket_id = 'templates' AND is_org_member(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "Users can delete their own templates" ON storage.objects;
CREATE POLICY "Users can delete their own templates"
ON storage.objects FOR DELETE
USING (bucket_id = 'templates' AND is_org_member(((storage.foldername(name))[1])::uuid));

DROP FUNCTION IF EXISTS public.storage_org_id(TEXT);
