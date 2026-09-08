-- ==========================================
-- ROLLBACK : permissions download_proposition / download_comparatif_sa_sp
-- Annule 2026-09-08_proposition_download_permissions.sql
-- ==========================================

-- 1. Restaure l'ancien défaut de colonne
ALTER TABLE organizations
ALTER COLUMN commercial_default_permissions SET DEFAULT '{
  "view_all_propositions": false,
  "manage_catalogue": false,
  "manage_templates": false,
  "view_credits_billing": false
}'::jsonb;

-- 2. Retire les deux clés des lignes existantes
UPDATE organizations
SET commercial_default_permissions =
      (commercial_default_permissions - 'download_proposition') - 'download_comparatif_sa_sp'
WHERE commercial_default_permissions ? 'download_proposition'
   OR commercial_default_permissions ? 'download_comparatif_sa_sp';

-- 3. Nettoie les overrides membres
UPDATE organization_members
SET permissions_override =
      (permissions_override - 'download_proposition') - 'download_comparatif_sa_sp'
WHERE permissions_override ? 'download_proposition'
   OR permissions_override ? 'download_comparatif_sa_sp';
