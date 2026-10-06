-- ROLLBACK : annule 2026-10-06_member_allowed_templates.sql
DROP TRIGGER IF EXISTS trg_remove_deleted_template_from_members ON proposition_templates;
DROP FUNCTION IF EXISTS remove_deleted_template_from_members();
ALTER TABLE organization_members DROP COLUMN IF EXISTS allowed_template_ids;
