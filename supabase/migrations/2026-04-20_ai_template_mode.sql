-- ============================================================
-- Ajoute le mode IA pour la création de templates Word
-- ============================================================
-- Colonnes :
--   creation_mode : 'classic' (existant) ou 'ai' (nouveau mode IA)
--   ai_analysis   : JSON contenant l'état de l'analyse IA
--                   (pages sélectionnées, variables, tableaux, chat...)
-- ============================================================

ALTER TABLE proposition_templates
  ADD COLUMN IF NOT EXISTS creation_mode VARCHAR(20) DEFAULT 'classic'
    CHECK (creation_mode IN ('classic', 'ai')),
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB;

CREATE INDEX IF NOT EXISTS idx_templates_creation_mode
  ON proposition_templates(creation_mode);
