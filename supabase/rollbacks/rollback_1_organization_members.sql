-- ==========================================
-- ROLLBACK de : 2026-08-25_organization_members.sql
-- ==========================================
-- À EXÉCUTER EN SECOND (après rollback_2_storage_org_member_policies.sql),
-- car ce script supprime la fonction is_org_member(), encore utilisée par
-- les policies Storage tant qu'elles n'ont pas été remises à leur état
-- d'origine.
--
-- ⚠️ DESTRUCTEUR : ce script supprime définitivement la table
-- organization_members (et donc tous les comptes commerciaux créés
-- depuis, ainsi que leurs permissions et informations de profil). Si des
-- commerciaux ont été créés entre-temps, leurs comptes Supabase Auth
-- (email/mot de passe) resteront mais deviendront orphelins — sans ligne
-- organization_members, ils ne pourront plus se connecter à aucune
-- organisation (resolveOrgContext renverra null pour eux). Vérifier avant
-- d'exécuter si des commerciaux existent, et les supprimer proprement
-- via l'admin Supabase Auth si besoin.
--
-- Remet en place l'état exact d'avant cette migration (copié depuis
-- supabase/schema.sql, supabase/migrations/2026-01-07_create_organization_on_signup.sql,
-- supabase/migrations/fix_admin_rls.sql, supabase/migrations/add_catalogue_produits.sql).

-- ==========================================
-- 1. RLS POLICIES : retour à auth.uid() direct (sans is_org_member)
-- ==========================================

-- ===== organizations =====
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
CREATE POLICY "Users can view their own organization"
ON organizations FOR SELECT
USING (auth.uid() = id OR (auth.jwt() ->> 'role') = 'admin');

-- ===== proposition_templates =====
DROP POLICY IF EXISTS "Users can view their own templates" ON proposition_templates;
CREATE POLICY "Users can view their own templates"
ON proposition_templates FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can insert their own templates" ON proposition_templates;
CREATE POLICY "Users can insert their own templates"
ON proposition_templates FOR INSERT
WITH CHECK (organization_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own templates" ON proposition_templates;
CREATE POLICY "Users can update their own templates"
ON proposition_templates FOR UPDATE
USING (organization_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own templates" ON proposition_templates;
CREATE POLICY "Users can delete their own templates"
ON proposition_templates FOR DELETE
USING (organization_id = auth.uid());

-- ===== propositions =====
DROP POLICY IF EXISTS "Users can view their own propositions" ON propositions;
CREATE POLICY "Users can view their own propositions"
ON propositions FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can insert their own propositions" ON propositions;
CREATE POLICY "Users can insert their own propositions"
ON propositions FOR INSERT
WITH CHECK (organization_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own propositions" ON propositions;
CREATE POLICY "Users can update their own propositions"
ON propositions FOR UPDATE
USING (organization_id = auth.uid());

-- ===== usage_analytics =====
DROP POLICY IF EXISTS "Users can view their own analytics" ON usage_analytics;
CREATE POLICY "Users can view their own analytics"
ON usage_analytics FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

-- ===== stripe_transactions =====
DROP POLICY IF EXISTS "Users can view their own transactions" ON stripe_transactions;
CREATE POLICY "Users can view their own transactions"
ON stripe_transactions FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can insert their own transactions" ON stripe_transactions;
CREATE POLICY "Users can insert their own transactions"
ON stripe_transactions FOR INSERT
WITH CHECK (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

-- ===== catalogues_produits =====
DROP POLICY IF EXISTS "Users can view base products and their own" ON catalogues_produits;
CREATE POLICY "Users can view base products and their own"
ON catalogues_produits FOR SELECT
USING (
  est_produit_base = true OR organization_id = auth.uid()
);

DROP POLICY IF EXISTS "Manage own and global products" ON catalogues_produits;
CREATE POLICY "Manage own and global products"
ON catalogues_produits FOR ALL
USING (
  organization_id = auth.uid() OR organization_id IS NULL
)
WITH CHECK (
  organization_id = auth.uid() OR organization_id IS NULL
);

-- ==========================================
-- 2. Supprimer la fonction RLS is_org_member
-- ==========================================
DROP FUNCTION IF EXISTS public.is_org_member(uuid);

-- ==========================================
-- 3. Restaurer le trigger de création automatique d'organisation
--    (retire 'commercial' de la condition de skip)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user_create_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_name text;
  user_role text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'client');

  -- Ne rien faire pour les admins
  IF user_role = 'admin' THEN
    RETURN NEW;
  END IF;

  org_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'organization_name', ''), NEW.email);

  INSERT INTO public.organizations (
    id,
    nom,
    email,
    secteur,
    claude_model,
    prompt_template,
    champs_defaut,
    tarif_par_proposition,
    credits
  )
  VALUES (
    NEW.id,
    org_name,
    NEW.email,
    NULL,
    'claude-sonnet-4-5-20250929',
    $prompt$Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

Analyse le(s) document(s) fourni(s) et extrais les informations demandées au format JSON.

STRUCTURE JSON ATTENDUE:
{
  "fournisseur": "Nom du fournisseur/distributeur actuel",
  "client": {
    "nom": "Nom du contact",
    "prenom": "Prénom",
    "email": "email@exemple.com",
    "fonction": "Fonction",
    "mobile": "06 XX XX XX XX",
    "fixe": "01 XX XX XX XX",
    "raison_sociale": "Nom de l'entreprise",
    "adresse": "Adresse complète",
    "code_postal": "75001",
    "ville": "Paris",
    "siret": "XXXXXXXXXXXXX",
    "ape": "Code APE",
    "capital": "Capital social",
    "forme_juridique": "SAS/SARL/etc",
    "rcs": "RCS"
  },
  "lignes": [
    {"numero_ligne": "0XXXXXXXXX", "type": "mobile|fixe|internet", "forfait": "Nom forfait", "quantite": "1", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ],
  "location_materiel": [
    {"type": "Location", "quantite": "1", "materiel": "Description", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ]
}

CHAMPS À EXTRAIRE:
{liste_champs_actifs}

RÈGLES:
- Retourne UNIQUEMENT un JSON valide
- Utilise null pour les informations absentes
- Les tarifs sont des nombres (29.99 et non "29,99€")
- Les tableaux peuvent contenir plusieurs éléments
- Extrais TOUTES les lignes trouvées dans le document

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.$prompt$,
    '[]'::jsonb,
    5.00,
    0.00
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ==========================================
-- 4. Retirer la colonne created_by de propositions
--    (l'index idx_propositions_created_by est supprimé automatiquement)
-- ==========================================
ALTER TABLE propositions DROP COLUMN IF EXISTS created_by;

-- ==========================================
-- 5. Retirer les permissions par défaut de organizations
-- ==========================================
ALTER TABLE organizations DROP COLUMN IF EXISTS commercial_default_permissions;

-- ==========================================
-- 6. Supprimer la table organization_members
--    (CASCADE supprime aussi ses policies, son trigger et son index)
-- ==========================================
DROP TABLE IF EXISTS organization_members CASCADE;
