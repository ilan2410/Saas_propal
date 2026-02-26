-- Migration: Tracking de la progression d'onboarding interactif
-- Date: 2026-02-17

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS onboarding_tours_seen JSONB DEFAULT '[]'::jsonb;

-- Index pour les requêtes fréquentes sur onboarding_completed
CREATE INDEX IF NOT EXISTS idx_organizations_onboarding_completed
  ON organizations(onboarding_completed);

-- Commentaires
COMMENT ON COLUMN organizations.onboarding_completed IS 'Indique si l''utilisateur a complété au moins un tour du guide interactif';
COMMENT ON COLUMN organizations.onboarding_completed_at IS 'Timestamp de la première complétion du guide';
COMMENT ON COLUMN organizations.onboarding_tours_seen IS 'Liste des tours vus par l''utilisateur, ex: ["welcome", "template-word", "proposition"]';
