CREATE TABLE IF NOT EXISTS catalogues_produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  categorie VARCHAR(50) NOT NULL CHECK (categorie IN ('mobile', 'internet', 'fixe', 'cloud', 'equipement', 'autre')),
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  fournisseur VARCHAR(100),
  prix_mensuel DECIMAL(10,2) NOT NULL,
  prix_installation DECIMAL(10,2),
  engagement_mois INTEGER,
  caracteristiques JSONB DEFAULT '{}'::jsonb,
  tags TEXT[],
  est_produit_base BOOLEAN DEFAULT false,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalogue_org ON catalogues_produits(organization_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_categorie ON catalogues_produits(categorie);
CREATE INDEX IF NOT EXISTS idx_catalogue_actif ON catalogues_produits(actif);
CREATE INDEX IF NOT EXISTS idx_catalogue_base ON catalogues_produits(est_produit_base);

ALTER TABLE catalogues_produits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view base products and their own"
ON catalogues_produits FOR SELECT
USING (
  est_produit_base = true OR organization_id = auth.uid()
);

CREATE POLICY "Users can manage their own products"
ON catalogues_produits FOR ALL
USING (organization_id = auth.uid())
WITH CHECK (organization_id = auth.uid());
