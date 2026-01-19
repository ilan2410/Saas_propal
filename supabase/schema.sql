-- ==========================================
-- SCHÉMA DE BASE DE DONNÉES SUPABASE
-- Plateforme SaaS Propositions Commerciales
-- ==========================================

-- ==========================================
-- TABLE: organizations (Clients de la plateforme)
-- ==========================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  secteur VARCHAR(100) CHECK (secteur IN ('telephonie', 'bureautique', 'mixte')),
  
  -- Configuration IA
  claude_model VARCHAR(50) DEFAULT 'claude-3-5-sonnet-20241022',
  prompt_template TEXT NOT NULL,
  prompt_version INTEGER DEFAULT 1,
  
  -- Champs par défaut (sélectionnables par le client)
  champs_defaut JSONB NOT NULL DEFAULT '[]',
  
  -- Tarification et crédits
  tarif_par_proposition DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  credits DECIMAL(10,2) DEFAULT 0.00,
  
  -- Quotas
  quotas JSONB DEFAULT '{
    "tailleMaxDocumentMB": 50,
    "nombreMaxDocumentsParProposition": 10,
    "tokensMaxParProposition": 200000
  }',
  
  -- Stripe
  stripe_customer_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_organizations_email ON organizations(email);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe ON organizations(stripe_customer_id);

-- ==========================================
-- TABLE: proposition_templates
-- ==========================================
CREATE TABLE IF NOT EXISTS proposition_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Métadonnées
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Fichier template MASTER
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(20) CHECK (file_type IN ('excel', 'word', 'pdf')),
  file_size_mb DECIMAL(10,2),
  
  -- Configuration spécifique au format
  file_config JSONB,
  
  -- Champs sélectionnés par le client
  champs_actifs JSONB NOT NULL DEFAULT '[]',
  
  -- Configuration IA
  claude_model VARCHAR(100) DEFAULT 'claude-3-7-sonnet-20250219',
  prompt_template TEXT,
  
  -- Configuration de fusion des catégories
  merge_config JSONB DEFAULT '[]',
  
  -- Statut du template
  statut VARCHAR(20) DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'teste', 'actif')),
  
  -- Résultat du test
  test_result JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_org ON proposition_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_statut ON proposition_templates(statut);

-- ==========================================
-- TABLE: propositions (Propositions générées)
-- ==========================================
CREATE TABLE IF NOT EXISTS propositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES proposition_templates(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Métadonnées client final
  nom_client VARCHAR(255),
  
  -- Documents source uploadés
  source_documents JSONB,
  
  -- Données extraites par Claude
  extracted_data JSONB,
  extraction_confidence JSONB,
  
  -- Données après édition manuelle
  filled_data JSONB,
  
  -- Fichiers générés
  original_template_url TEXT,
  duplicated_template_url TEXT,
  generated_file_name VARCHAR(255),
  
  -- Métriques IA
  tokens_used JSONB,
  processing_time_ms INTEGER,
  cout_ia DECIMAL(10,4),
  
  -- Éditions manuelles
  champs_modifies JSONB,
  
  -- Statut
  statut VARCHAR(20) DEFAULT 'processing' CHECK (statut IN ('processing', 'ready', 'exported', 'error')),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  exported_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_propositions_org ON propositions(organization_id);
CREATE INDEX IF NOT EXISTS idx_propositions_template ON propositions(template_id);
CREATE INDEX IF NOT EXISTS idx_propositions_statut ON propositions(statut);
CREATE INDEX IF NOT EXISTS idx_propositions_created ON propositions(created_at DESC);

-- ==========================================
-- TABLE: usage_analytics (Métriques par client)
-- ==========================================
CREATE TABLE IF NOT EXISTS usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  periode VARCHAR(7) NOT NULL, -- Format: 'YYYY-MM'
  
  -- Compteurs
  propositions_count INTEGER DEFAULT 0,
  tokens_total JSONB DEFAULT '{"input": 0, "output": 0, "total": 0}',
  cout_total DECIMAL(10,2) DEFAULT 0.00,
  cout_ia_total DECIMAL(10,2) DEFAULT 0.00,
  
  -- Performance
  taux_succes DECIMAL(5,2),
  temps_moyen_ms INTEGER,
  
  -- Qualité
  taux_modification DECIMAL(5,2),
  champs_plus_modifies JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(organization_id, periode)
);

CREATE INDEX IF NOT EXISTS idx_analytics_org_periode ON usage_analytics(organization_id, periode);

-- ==========================================
-- TABLE: stripe_transactions (Historique de paiements)
-- ==========================================
CREATE TABLE IF NOT EXISTS stripe_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_session_id VARCHAR(255),
  
  -- Montants
  montant DECIMAL(10,2) NOT NULL,
  credits_ajoutes DECIMAL(10,2) NOT NULL,
  
  -- Statut
  statut VARCHAR(20) CHECK (statut IN ('pending', 'succeeded', 'failed', 'refunded')),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_org ON stripe_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_intent ON stripe_transactions(stripe_payment_intent_id);

-- ==========================================
-- FUNCTIONS & TRIGGERS
-- ==========================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur organizations et proposition_templates
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at 
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_templates_updated_at ON proposition_templates;
CREATE TRIGGER update_templates_updated_at 
BEFORE UPDATE ON proposition_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour ajouter des crédits
CREATE OR REPLACE FUNCTION add_credits(org_id UUID, amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits = credits + amount,
      updated_at = NOW()
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour débiter des crédits
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

-- Fonction pour mettre à jour les analytics
CREATE OR REPLACE FUNCTION update_analytics(org_id UUID, proposition_id UUID)
RETURNS void AS $$
DECLARE
  current_periode VARCHAR(7);
  prop_tokens JSONB;
  prop_cout DECIMAL(10,2);
BEGIN
  current_periode := TO_CHAR(NOW(), 'YYYY-MM');
  
  -- Récupérer les données de la proposition
  SELECT tokens_used, cout_ia
  INTO prop_tokens, prop_cout
  FROM propositions
  WHERE id = proposition_id;
  
  -- Insert or update analytics
  INSERT INTO usage_analytics (organization_id, periode, propositions_count, tokens_total, cout_ia_total)
  VALUES (org_id, current_periode, 1, prop_tokens, prop_cout)
  ON CONFLICT (organization_id, periode)
  DO UPDATE SET
    propositions_count = usage_analytics.propositions_count + 1,
    tokens_total = jsonb_build_object(
      'input', (usage_analytics.tokens_total->>'input')::int + (prop_tokens->>'input')::int,
      'output', (usage_analytics.tokens_total->>'output')::int + (prop_tokens->>'output')::int,
      'total', (usage_analytics.tokens_total->>'total')::int + (prop_tokens->>'total')::int
    ),
    cout_ia_total = usage_analytics.cout_ia_total + prop_cout;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Activer RLS sur toutes les tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposition_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE propositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_transactions ENABLE ROW LEVEL SECURITY;

-- Policies pour organizations
CREATE POLICY "Users can view their own organization"
ON organizations FOR SELECT
USING (auth.uid() = id OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can insert organizations"
ON organizations FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can update organizations"
ON organizations FOR UPDATE
USING ((auth.jwt() ->> 'role') = 'admin');

-- Policies pour proposition_templates
CREATE POLICY "Users can view their own templates"
ON proposition_templates FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

CREATE POLICY "Users can insert their own templates"
ON proposition_templates FOR INSERT
WITH CHECK (organization_id = auth.uid());

CREATE POLICY "Users can update their own templates"
ON proposition_templates FOR UPDATE
USING (organization_id = auth.uid());

CREATE POLICY "Users can delete their own templates"
ON proposition_templates FOR DELETE
USING (organization_id = auth.uid());

-- Policies pour propositions
CREATE POLICY "Users can view their own propositions"
ON propositions FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

CREATE POLICY "Users can insert their own propositions"
ON propositions FOR INSERT
WITH CHECK (organization_id = auth.uid());

CREATE POLICY "Users can update their own propositions"
ON propositions FOR UPDATE
USING (organization_id = auth.uid());

-- Policies pour usage_analytics
CREATE POLICY "Users can view their own analytics"
ON usage_analytics FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

-- Policies pour stripe_transactions
CREATE POLICY "Users can view their own transactions"
ON stripe_transactions FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

CREATE POLICY "Users can insert their own transactions"
ON stripe_transactions FOR INSERT
WITH CHECK (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

-- ==========================================
-- DONNÉES DE TEST (OPTIONNEL)
-- ==========================================

-- Créer un utilisateur admin de test (à exécuter manuellement si besoin)
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
-- VALUES (
--   gen_random_uuid(),
--   'admin@example.com',
--   crypt('password123', gen_salt('bf')),
--   NOW(),
--   '{"role": "admin"}'::jsonb
-- );
