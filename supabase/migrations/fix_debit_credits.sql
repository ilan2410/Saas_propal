-- Migration pour corriger la fonction debit_credits
-- Supprime la double vérification des crédits qui causait des erreurs

-- D'abord, supprimer l'ancienne fonction
DROP FUNCTION IF EXISTS debit_credits(UUID, DECIMAL);

-- Recréer la fonction sans la double vérification
CREATE OR REPLACE FUNCTION debit_credits(org_id UUID, amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits = credits - amount,
      updated_at = NOW()
  WHERE id = org_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisation non trouvée';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Ajouter un commentaire pour expliquer le changement
COMMENT ON FUNCTION debit_credits IS 'Débite les crédits d une organisation. La vérification des fonds suffisants est faite au niveau applicatif.';
