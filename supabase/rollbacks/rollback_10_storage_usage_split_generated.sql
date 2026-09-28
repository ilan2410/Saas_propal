-- Annule 2026-09-29_storage_usage_split_generated.sql : restaure la version
-- sans drapeau `generated` de 2026-09-28_ai_usage_events.sql.
-- Attention : cette version réunit templates maîtres et propositions générées
-- sur une seule ligne, ce qui surestime visuellement le nombre de templates.

DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org(UUID);

CREATE OR REPLACE FUNCTION public.admin_storage_usage_by_org(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (organization_id UUID, bucket_id TEXT, bytes BIGINT, objects BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  WITH chemins AS (
    SELECT
      o.bucket_id,
      COALESCE((o.metadata ->> 'size')::BIGINT, 0) AS taille,
      CASE
        WHEN o.path_tokens[1] = 'generated' THEN o.path_tokens[2]
        ELSE o.path_tokens[1]
      END AS org_texte
    FROM storage.objects o
  ),
  candidats AS (
    SELECT
      c.bucket_id,
      c.taille,
      CASE
        WHEN c.org_texte ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN c.org_texte::UUID
      END AS org_uuid
    FROM chemins c
  )
  SELECT
    org.id,
    c.bucket_id,
    SUM(c.taille)::BIGINT,
    COUNT(*)::BIGINT
  FROM candidats c
  LEFT JOIN public.organizations org ON org.id = c.org_uuid
  WHERE p_organization_id IS NULL OR org.id = p_organization_id
  GROUP BY org.id, c.bucket_id;
$fn$;

REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage_by_org(UUID) TO service_role;
