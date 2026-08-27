-- ==========================================
-- STORAGE RLS: policies pour comptes commerciaux (organization_members)
-- ==========================================
-- Contexte : les policies Storage des buckets `documents` et `propositions`
-- (définies dans supabase/storage.sql) comparaient (storage.foldername(name))[1]
-- ou propositions.organization_id directement à auth.uid(), en supposant
-- organization_id === user.id. Depuis l'introduction des sous-comptes
-- commerciaux (organization_members, cf. 2026-08-25_organization_members.sql),
-- cette hypothèse est fausse pour un commercial : auth.uid() est l'id du
-- sous-compte, pas celui de l'organisation propriétaire des fichiers.
--
-- On réutilise la fonction is_org_member(target_org_id uuid) (SECURITY DEFINER,
-- définie dans 2026-08-25_organization_members.sql) pour couvrir à la fois le
-- propriétaire (target_org_id = auth.uid()) et un commercial actif rattaché
-- via organization_members.
--
-- Périmètre : les policies listées ci-dessous pour les buckets `documents`,
-- `propositions` et `templates` (hors "Service can create propositions" qui
-- n'est pas scopée par utilisateur). Le bucket `templates` est couvert malgré
-- la permission manage_templates n'étant pas accordée par défaut aux
-- commerciaux : app/api/templates/upload/route.ts construit déjà le chemin de
-- stockage à partir de ctx.organizationId (cf. Task 4), donc dès qu'un
-- commercial se voit accorder manage_templates (Task 5+), ces policies
-- doivent déjà accepter le chemin `<organization_id>/...` plutôt que
-- `<auth.uid()>/...`.
--
-- Ne pas exécuter directement contre une base de données depuis cet
-- environnement : relecture manuelle uniquement, comme pour
-- 2026-08-25_organization_members.sql.

-- ==========================================
-- BUCKET: documents
-- ==========================================

DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Users can read their own documents" ON storage.objects;
CREATE POLICY "Users can read their own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  is_org_member(((storage.foldername(name))[1])::uuid)
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
    AND is_org_member(propositions.organization_id)
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
  is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Users can read their own templates" ON storage.objects;
CREATE POLICY "Users can read their own templates"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'templates' AND
  is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Users can update their own templates" ON storage.objects;
CREATE POLICY "Users can update their own templates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'templates' AND
  is_org_member(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Users can delete their own templates" ON storage.objects;
CREATE POLICY "Users can delete their own templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'templates' AND
  is_org_member(((storage.foldername(name))[1])::uuid)
);
