-- Correctif d'affichage de la volumétrie : le bucket `templates` contient à la
-- fois les templates maîtres (`<orgId>/…`) et TOUTES les propositions générées
-- (`generated/<orgId>/Propal_…`, voir lib/generators/index.ts). Les additionner
-- sur une seule ligne fait lire « 27 templates » à un client qui n'en a que
-- deux. La fonction rend désormais un drapeau `generated` pour que les écrans
-- affichent deux lignes distinctes.
--
-- Suite de 2026-09-28_ai_usage_events.sql, déjà appliquée. Le type de retour
-- change : DROP obligatoire, CREATE OR REPLACE refuse de changer une signature.
-- Idempotent : sans risque à rejouer.

DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org(UUID);
DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org();

CREATE OR REPLACE FUNCTION public.admin_storage_usage_by_org(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  bucket_id TEXT,
  generated BOOLEAN,
  bytes BIGINT,
  objects BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  WITH chemins AS (
    SELECT
      o.bucket_id,
      COALESCE((o.metadata ->> 'size')::BIGINT, 0) AS taille,
      (o.path_tokens[1] = 'generated') AS est_genere,
      -- Les fichiers générés vivent sous generated/<orgId>/, tout le reste
      -- sous <orgId>/.
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
      COALESCE(c.est_genere, FALSE) AS est_genere,
      -- Le CASE court-circuite VRAIMENT, contrairement aux quals d'une clause
      -- ON : placer le regex dans le JOIN laisserait Postgres évaluer le cast
      -- sur toutes les lignes (clé de hachage) et lever 22P02 sur le premier
      -- objet écrit à la racine d'un bucket — ce que font les générateurs
      -- historiques du bucket `propositions`. Toute la volumétrie tomberait
      -- alors en silence.
      CASE
        WHEN c.org_texte ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN c.org_texte::UUID
      END AS org_uuid
    FROM chemins c
  )
  SELECT
    org.id,
    c.bucket_id,
    c.est_genere,
    SUM(c.taille)::BIGINT,
    COUNT(*)::BIGINT
  FROM candidats c
  LEFT JOIN public.organizations org ON org.id = c.org_uuid
  -- NULL = toutes les organisations, y compris la ligne "non attribué".
  WHERE p_organization_id IS NULL OR org.id = p_organization_id
  GROUP BY org.id, c.bucket_id, c.est_genere;
$fn$;

REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage_by_org(UUID) TO service_role;
