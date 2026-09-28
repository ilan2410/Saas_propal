-- Volumétrie : classer les fichiers par CATÉGORIE MÉTIER, plus par bucket.
--
-- Les buckets sont de la plomberie : `templates` contient à la fois les
-- templates maîtres et toutes les propositions générées, `documents` contient
-- les pièces jointes. Afficher les noms de buckets oblige le lecteur à
-- connaître cette plomberie et fait lire « 27 templates » à un client qui n'en
-- a que deux.
--
-- Deuxième correction : les fichiers générés orphelins étaient comptés comme
-- des propositions valides. Chaque régénération supprime le fichier précédent
-- (app/api/propositions/[id]/generate/route.ts), mais en best-effort avec
-- erreur avalée — d'où 19 fichiers pour 15 propositions. Un fichier généré
-- qu'aucune proposition ne référence est désormais un orphelin, comme pour les
-- templates.
--
-- Catégories rendues :
--   pieces_jointes        documents source et pièces jointes des propositions
--   propositions_generees fichiers Word/Excel générés, encore référencés
--   templates             templates maîtres, encore référencés
--   logos                 logos et fonds de page
--   images_catalogue      visuels produits
--   orphelins             fichiers que plus rien ne référence (espace récupérable)
--   autres                tout le reste, y compris les buckets non préfixés
--
-- Suite de 2026-09-29_storage_usage_orphan_templates.sql. Le type de retour
-- change : DROP obligatoire. Idempotent : sans risque à rejouer.

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
      c.taille,
      c.org_uuid,
      CASE
        -- Templates maîtres : référencés par proposition_templates.file_url.
        -- `file_url` est une URL publique ; le chemin de stockage est ce qui
        -- suit « /templates/ ». safeStorageFileName ne produit que [a-z0-9-],
        -- donc l'appariement est exact ; le replace couvre les fichiers anciens.
        WHEN c.bucket_id = 'templates' AND NOT c.est_genere THEN
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
        WHEN c.bucket_id = 'templates' AND c.est_genere THEN
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
  SELECT
    org.id,
    c.categorie,
    SUM(c.taille)::BIGINT,
    COUNT(*)::BIGINT
  FROM classes c
  LEFT JOIN public.organizations org ON org.id = c.org_uuid
  -- NULL = toutes les organisations, y compris la ligne "non attribué".
  WHERE p_organization_id IS NULL OR org.id = p_organization_id
  GROUP BY org.id, c.categorie;
$fn$;

REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage_by_org(UUID) TO service_role;
