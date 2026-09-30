-- Nettoyage des fichiers orphelins + correction de la cause principale.
--
-- CAUSE RACINE. Les policies RLS du bucket `templates` (migration
-- 2026-08-25_storage_org_member_policies.sql) écrivent :
--     is_org_member(((storage.foldername(name))[1])::uuid)
-- Sur un fichier généré, le chemin est `generated/<orgId>/Propal_….docx` :
-- le premier segment vaut 'generated', le cast lève 22P02 et la suppression
-- ÉCHOUE. Comme app/api/propositions/[id]/generate/route.ts ne regarde pas
-- l'erreur rendue par .remove(), l'échec est invisible et le fichier reste.
-- D'où l'accumulation constatée : 192 fichiers orphelins pour une organisation
-- n'ayant qu'un seul template actif.
--
-- Ce fichier fait trois choses :
--   1. public.storage_org_id(name) : extraction de l'organisation depuis un
--      chemin de stockage, cast protégé. Source unique de cette règle.
--   2. Réécriture des 4 policies du bucket `templates` avec cette fonction.
--   3. public.admin_storage_classify() : classification d'UN fichier, dont
--      dérivent la volumétrie agrégée et la liste des orphelins — pour que la
--      définition d'« orphelin » ne vive qu'à un seul endroit.
--
-- Idempotent : sans risque à rejouer.

-- ==========================================
-- 1. Extraction de l'organisation, cast protégé
-- ==========================================
CREATE OR REPLACE FUNCTION public.storage_org_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN t.segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN t.segment::UUID
  END
  FROM (
    SELECT CASE
      WHEN s.parties[1] = 'generated' THEN s.parties[2]
      ELSE s.parties[1]
    END AS segment
    FROM (SELECT string_to_array(object_name, '/') AS parties) s
  ) t;
$fn$;

COMMENT ON FUNCTION public.storage_org_id(TEXT) IS
  'Organisation propriétaire d''un objet de storage, NULL si le chemin n''en désigne aucune. Le CASE protège le cast : un chemin ne commençant pas par un UUID (fichier à la racine d''un bucket, préfixe generated/) ne doit jamais lever 22P02.';

-- ==========================================
-- 2. Policies du bucket templates
-- ==========================================
-- is_org_member(NULL) rend NULL, traité comme faux par RLS : un chemin non
-- rattachable reste inaccessible aux utilisateurs (le service role, lui,
-- contourne RLS).

DROP POLICY IF EXISTS "Users can upload their own templates" ON storage.objects;
CREATE POLICY "Users can upload their own templates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'templates' AND
  public.is_org_member(public.storage_org_id(name))
);

DROP POLICY IF EXISTS "Users can read their own templates" ON storage.objects;
CREATE POLICY "Users can read their own templates"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'templates' AND
  public.is_org_member(public.storage_org_id(name))
);

DROP POLICY IF EXISTS "Users can update their own templates" ON storage.objects;
CREATE POLICY "Users can update their own templates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'templates' AND
  public.is_org_member(public.storage_org_id(name))
);

DROP POLICY IF EXISTS "Users can delete their own templates" ON storage.objects;
CREATE POLICY "Users can delete their own templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'templates' AND
  public.is_org_member(public.storage_org_id(name))
);

-- ==========================================
-- 3. Classification, fichier par fichier
-- ==========================================
-- Une seule définition d'« orphelin », dont dérivent la volumétrie agrégée et
-- la liste à supprimer. Deux définitions divergeraient, et celle qui sert à
-- supprimer est celle qu'on ne peut pas se permettre d'avoir fausse.
CREATE OR REPLACE FUNCTION public.admin_storage_classify(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  bucket_id TEXT,
  name TEXT,
  categorie TEXT,
  bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  WITH candidats AS (
    SELECT
      o.bucket_id,
      o.name,
      COALESCE((o.metadata ->> 'size')::BIGINT, 0) AS taille,
      (o.path_tokens[1] = 'generated') AS est_genere,
      public.storage_org_id(o.name) AS org_uuid
    FROM storage.objects o
  ),
  classes AS (
    SELECT
      c.bucket_id,
      c.name,
      c.taille,
      c.org_uuid,
      CASE
        -- Templates maîtres : référencés par proposition_templates.file_url.
        -- `file_url` est une URL publique ; le chemin de stockage est ce qui
        -- suit « /templates/ ». safeStorageFileName ne produit que [a-z0-9-],
        -- donc l'appariement est exact ; le replace couvre les fichiers anciens.
        WHEN c.bucket_id = 'templates' AND NOT COALESCE(c.est_genere, FALSE) THEN
          CASE
            WHEN c.org_uuid IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.proposition_templates t
              WHERE t.organization_id = c.org_uuid
                AND t.file_url IS NOT NULL
                AND replace(split_part(t.file_url, '/templates/', 2), '%20', ' ') = c.name
            ) THEN 'templates'
            ELSE 'orphelins'
          END

        -- Fichiers générés : référencés par une proposition. La colonne
        -- historique `fichier_genere_url` n'existe pas partout, d'où le passage
        -- par to_jsonb : une colonne absente ne fait pas échouer la fonction.
        WHEN c.bucket_id = 'templates' AND COALESCE(c.est_genere, FALSE) THEN
          CASE
            WHEN c.org_uuid IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.propositions p
              WHERE p.organization_id = c.org_uuid
                AND EXISTS (
                  SELECT 1 FROM jsonb_each_text(to_jsonb(p)) AS kv(cle, valeur)
                  WHERE kv.cle IN ('duplicated_template_url', 'fichier_genere_url')
                    AND kv.valeur LIKE '%/templates/%'
                    AND replace(split_part(kv.valeur, '/templates/', 2), '%20', ' ') = c.name
                )
            ) THEN 'propositions_generees'
            ELSE 'orphelins'
          END

        WHEN c.bucket_id IN ('documents', 'proposition-attachments') THEN 'pieces_jointes'
        WHEN c.bucket_id = 'logos' THEN 'logos'
        WHEN c.bucket_id = 'catalogue-images' THEN 'images_catalogue'
        ELSE 'autres'
      END AS categorie
    FROM candidats c
  )
  SELECT c.org_uuid, c.bucket_id, c.name, c.categorie, c.taille
  FROM classes c
  WHERE p_organization_id IS NULL OR c.org_uuid = p_organization_id;
$fn$;

-- ==========================================
-- 4. Volumétrie agrégée (dérivée de la classification)
-- ==========================================
DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org(UUID);

CREATE OR REPLACE FUNCTION public.admin_storage_usage_by_org(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  categorie TEXT,
  bytes BIGINT,
  objects BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  SELECT
    org.id,
    f.categorie,
    SUM(f.bytes)::BIGINT,
    COUNT(*)::BIGINT
  FROM public.admin_storage_classify(p_organization_id) f
  LEFT JOIN public.organizations org ON org.id = f.organization_id
  GROUP BY org.id, f.categorie;
$fn$;

-- ==========================================
-- 5. Liste des orphelins, pour suppression
-- ==========================================
CREATE OR REPLACE FUNCTION public.admin_orphan_files(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  bucket_id TEXT,
  name TEXT,
  bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  SELECT f.organization_id, f.bucket_id, f.name, f.bytes
  FROM public.admin_storage_classify(p_organization_id) f
  WHERE f.categorie = 'orphelins'
  ORDER BY f.bytes DESC;
$fn$;

REVOKE ALL ON FUNCTION public.admin_storage_classify(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_classify(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_classify(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage_by_org(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.admin_orphan_files(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_orphan_files(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_orphan_files(UUID) TO service_role;
