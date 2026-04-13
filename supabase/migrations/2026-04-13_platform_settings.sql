-- ==========================================
-- TABLE: platform_settings
-- Paramètres globaux de la plateforme (admin)
-- ==========================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read platform settings"
ON platform_settings FOR SELECT
USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can insert platform settings"
ON platform_settings FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can update platform settings"
ON platform_settings FOR UPDATE
USING ((auth.jwt() ->> 'role') = 'admin');

-- Valeur par défaut : tarif_par_proposition
INSERT INTO platform_settings (key, value)
VALUES ('tarif_par_proposition_defaut', '5.00'::jsonb)
ON CONFLICT (key) DO NOTHING;
