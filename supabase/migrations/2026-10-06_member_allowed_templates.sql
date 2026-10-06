-- ==========================================
-- Restriction des templates utilisables par un commercial
-- NULL = tous les templates de l'organisation (comportement historique)
-- tableau (même vide) = uniquement ces templates pour créer une proposition
-- ==========================================
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS allowed_template_ids UUID[] DEFAULT NULL;

-- ==========================================
-- Suppression d'un template : on le retire des listes des commerciaux
-- ==========================================
CREATE OR REPLACE FUNCTION remove_deleted_template_from_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organization_members
  SET allowed_template_ids = array_remove(allowed_template_ids, OLD.id)
  WHERE allowed_template_ids @> ARRAY[OLD.id];
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_deleted_template_from_members ON proposition_templates;
CREATE TRIGGER trg_remove_deleted_template_from_members
AFTER DELETE ON proposition_templates
FOR EACH ROW EXECUTE FUNCTION remove_deleted_template_from_members();
