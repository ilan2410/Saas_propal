-- ==========================================
-- ROLLBACK de : 2026-09-20_organization_note_title_template.sql
-- ==========================================

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS organizations_note_title_template_length_check;

ALTER TABLE public.organizations
DROP COLUMN IF EXISTS note_title_template;
