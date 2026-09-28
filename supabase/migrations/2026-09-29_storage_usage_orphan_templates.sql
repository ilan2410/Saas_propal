-- Volumétrie : isoler les fichiers de templates devenus orphelins.
--
-- Constat sur les données réelles : une organisation avec 2 templates actifs
-- occupait 8 fichiers, une autre 193 pour 1 seul template actif (87 Mo). Trois
-- causes se cumulent, toutes dans le code existant :
--   - app/api/templates/upload/route.ts dépose le fichier AVANT que la ligne
--     `proposition_templates` existe : tout envoi abandonné laisse un fichier ;
--   - la suppression d'un template (app/api/templates/[id]/route.ts) et le
--     remplacement de son fichier nettoient le stockage en best-effort, erreur
--     avalée : un échec laisse un fichier ;
--   - les policies RLS de storage.objects castent `foldername(name)[1]` en uuid,
--     ce qui échoue sur les chemins `generated/…` et peut faire échouer des
--     suppressions.
-- Ces fichiers occupent réellement l'espace : les masquer serait mentir. Ils
-- sont donc comptés, mais sur leur propre ligne.
--
-- Suite de 2026-09-29_storage_usage_split_generated.sql. Le type de retour
-- change : DROP obligatoire. Idempotent : sans risque à rejouer.

DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org(UUID);

CREATE OR REPLACE FUNCTION public.admin_storage_usage_by_org(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  bucket_id TEXT,
  generated BOOLEAN,
  orphan BOOLEAN,
  bytes BIGINT,
  objects BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  WITH bruts AS (
    SELECT
      o.bucket_id,
      o.name,
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
      b.bucket_id,
      b.name,
      b.taille,
      COALESCE(b.est_genere, FALSE) AS est_genere,
      -- Le CASE court-circuite VRAIMENT, contrairement aux quals d'une clause
      -- ON : placer le regex dans le JOIN laisserait Postgres évaluer le cast
      -- sur toutes les lignes (clé de hachage) et lever 22P02 sur le premier
      -- objet écrit à la racine d'un bucket — ce que font les générateurs
      -- historiques du bucket `propositions`. Toute la volumétrie tomberait
      -- alors en silence.
      CASE
        WHEN b.org_texte ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN b.org_texte::UUID
      END AS org_uuid
    FROM bruts b
  ),
  classes AS (
    SELECT
      c.bucket_id,
      c.taille,
      c.est_genere,
      c.org_uuid,
      -- Orphelin : un template maître qu'aucune ligne proposition_templates ne
      -- référence. Ne concerne que les templates maîtres — les autres buckets
      -- n'ont pas de référence équivalente et restent à FALSE.
      -- `file_url` est une URL publique : le chemin de stockage est ce qui suit
      -- « /templates/ ». safeStorageFileName ne produit que [a-z0-9-], donc
      -- l'appariement est exact ; le replace couvre les fichiers anciens.
      (
        c.bucket_id = 'templates'
        AND NOT c.est_genere
        AND c.org_uuid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.proposition_templates t
          WHERE t.organization_id = c.org_uuid
            AND t.file_url IS NOT NULL
            AND replace(split_part(t.file_url, '/templates/', 2), '%20', ' ') = c.name
        )
      ) AS est_orphelin
    FROM candidats c
  )
  SELECT
    org.id,
    c.bucket_id,
    c.est_genere,
    c.est_orphelin,
    SUM(c.taille)::BIGINT,
    COUNT(*)::BIGINT
  FROM classes c
  LEFT JOIN public.organizations org ON org.id = c.org_uuid
  -- NULL = toutes les organisations, y compris la ligne "non attribué".
  WHERE p_organization_id IS NULL OR org.id = p_organization_id
  GROUP BY org.id, c.bucket_id, c.est_genere, c.est_orphelin;
$fn$;

REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage_by_org(UUID) TO service_role;
