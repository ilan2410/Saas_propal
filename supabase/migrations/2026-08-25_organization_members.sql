-- ==========================================
-- MIGRATION: organization_members, permissions, RLS
-- Support pour les commerciaux (sous-comptes) dans les organizations
-- ==========================================

-- ==========================================
-- 1. TABLE: organization_members
-- ==========================================
CREATE TABLE IF NOT EXISTS organization_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL DEFAULT 'commercial' CHECK (role IN ('commercial')),
  prenom                TEXT,
  nom                   TEXT,
  telephone_fixe        TEXT,
  telephone_mobile      TEXT,
  actif                 BOOLEAN NOT NULL DEFAULT true,
  permissions_override  JSONB,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id);

DROP TRIGGER IF EXISTS update_organization_members_updated_at ON organization_members;
CREATE TRIGGER update_organization_members_updated_at
BEFORE UPDATE ON organization_members
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 2. DEFAULT PERMISSIONS ON organizations
-- ==========================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS commercial_default_permissions JSONB NOT NULL DEFAULT '{
  "view_all_propositions": false,
  "manage_catalogue": false,
  "manage_templates": false,
  "view_credits_billing": false
}'::jsonb;

-- ==========================================
-- 3. TRACK PROPOSITION CREATOR
-- ==========================================
ALTER TABLE propositions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE propositions SET created_by = organization_id WHERE created_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_propositions_created_by ON propositions(created_by);

-- ==========================================
-- 4. UPDATE TRIGGER FUNCTION: handle_new_user_create_organization
-- ==========================================
-- Allow 'commercial' role users to skip auto-organization creation
-- (same function body as 2026-01-07, only the IF condition changed)
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

  -- Ne rien faire pour les admins et les commerciaux
  IF user_role IN ('admin', 'commercial') THEN
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
-- 5. RLS HELPER FUNCTION: is_org_member
-- ==========================================
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    target_org_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = target_org_id
        AND m.user_id = auth.uid()
        AND m.actif = true
    );
$$;

-- ==========================================
-- 6. RLS POLICIES REWRITE
-- ==========================================

-- ===== organizations =====
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
CREATE POLICY "Users can view their own organization"
ON organizations FOR SELECT
USING (is_org_member(id) OR (auth.jwt() ->> 'role') = 'admin');

-- ===== proposition_templates =====
DROP POLICY IF EXISTS "Users can view their own templates" ON proposition_templates;
CREATE POLICY "Users can view their own templates"
ON proposition_templates FOR SELECT
USING (
  is_org_member(organization_id)
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can insert their own templates" ON proposition_templates;
CREATE POLICY "Users can insert their own templates"
ON proposition_templates FOR INSERT
WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update their own templates" ON proposition_templates;
CREATE POLICY "Users can update their own templates"
ON proposition_templates FOR UPDATE
USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete their own templates" ON proposition_templates;
CREATE POLICY "Users can delete their own templates"
ON proposition_templates FOR DELETE
USING (is_org_member(organization_id));

-- ===== propositions =====
DROP POLICY IF EXISTS "Users can view their own propositions" ON propositions;
CREATE POLICY "Users can view their own propositions"
ON propositions FOR SELECT
USING (
  is_org_member(organization_id)
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can insert their own propositions" ON propositions;
CREATE POLICY "Users can insert their own propositions"
ON propositions FOR INSERT
WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update their own propositions" ON propositions;
CREATE POLICY "Users can update their own propositions"
ON propositions FOR UPDATE
USING (is_org_member(organization_id));

-- ===== usage_analytics =====
DROP POLICY IF EXISTS "Users can view their own analytics" ON usage_analytics;
CREATE POLICY "Users can view their own analytics"
ON usage_analytics FOR SELECT
USING (
  is_org_member(organization_id)
  OR (auth.jwt() ->> 'role') = 'admin'
);

-- ===== stripe_transactions =====
DROP POLICY IF EXISTS "Users can view their own transactions" ON stripe_transactions;
CREATE POLICY "Users can view their own transactions"
ON stripe_transactions FOR SELECT
USING (
  is_org_member(organization_id)
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Users can insert their own transactions" ON stripe_transactions;
CREATE POLICY "Users can insert their own transactions"
ON stripe_transactions FOR INSERT
WITH CHECK (
  is_org_member(organization_id)
  OR (auth.jwt() ->> 'role') = 'admin'
);

-- ===== catalogues_produits =====
DROP POLICY IF EXISTS "Users can view base products and their own" ON catalogues_produits;
CREATE POLICY "Users can view base products and their own"
ON catalogues_produits FOR SELECT
USING (
  est_produit_base = true OR is_org_member(organization_id)
);

DROP POLICY IF EXISTS "Manage own and global products" ON catalogues_produits;
CREATE POLICY "Manage own and global products"
ON catalogues_produits FOR ALL
USING (
  is_org_member(organization_id) OR organization_id IS NULL
)
WITH CHECK (
  is_org_member(organization_id) OR organization_id IS NULL
);

-- ==========================================
-- 7. RLS POLICIES ON organization_members
-- ==========================================
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their team"
ON organization_members FOR SELECT
USING (organization_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "Owners can manage their team"
ON organization_members FOR ALL
USING (organization_id = auth.uid())
WITH CHECK (organization_id = auth.uid());
