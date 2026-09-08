-- ==========================================
-- Permissions commerciales : téléchargement proposition & comparatifs SA/SP
-- ==========================================
-- Deux nouvelles clés dans organizations.commercial_default_permissions :
--   download_proposition        : générer / télécharger la proposition
--   download_comparatif_sa_sp   : télécharger les comparatifs SA/SP
-- Activées par défaut (ne pas casser les workflows existants). L'override
-- par membre (organization_members.permissions_override) reste prioritaire.

-- 1. Nouveau défaut de colonne pour les organisations créées ensuite
ALTER TABLE organizations
ALTER COLUMN commercial_default_permissions SET DEFAULT '{
  "view_all_propositions": false,
  "manage_catalogue": false,
  "manage_templates": false,
  "view_credits_billing": false,
  "download_proposition": true,
  "download_comparatif_sa_sp": true
}'::jsonb;

-- 2. Backfill des organisations existantes : on n'ajoute que les clés absentes,
--    sans toucher aux valeurs déjà positionnées par le propriétaire.
UPDATE organizations
SET commercial_default_permissions =
      COALESCE(commercial_default_permissions, '{}'::jsonb)
      || CASE
           WHEN COALESCE(commercial_default_permissions, '{}'::jsonb) ? 'download_proposition'
           THEN '{}'::jsonb
           ELSE '{"download_proposition": true}'::jsonb
         END
      || CASE
           WHEN COALESCE(commercial_default_permissions, '{}'::jsonb) ? 'download_comparatif_sa_sp'
           THEN '{}'::jsonb
           ELSE '{"download_comparatif_sa_sp": true}'::jsonb
         END
WHERE commercial_default_permissions IS NULL
   OR NOT (commercial_default_permissions ? 'download_proposition')
   OR NOT (commercial_default_permissions ? 'download_comparatif_sa_sp');
