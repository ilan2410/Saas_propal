\set ON_ERROR_STOP on
-- Run after organization-access.sql, only in the same disposable fixture database.
CREATE TEMP TABLE policies_before_failed_rollback AS SELECT to_jsonb(p) AS state FROM pg_policies p;
CREATE VIEW access_test.rollback_dependency AS
  SELECT public.can_access_proposition(NULL::uuid, NULL::uuid);
-- This deliberate dependency must abort rollback atomically (no CASCADE).
\set ON_ERROR_STOP off
\ir ../../supabase/rollbacks/rollback_14_organization_access_hardening.sql
\set ON_ERROR_STOP on
SELECT access_test.assert_true((SELECT count(*)=1 FROM organization_access_backup.hardening_20261011),'failed rollback retains snapshot');
SELECT access_test.assert_true(NOT EXISTS (
  (SELECT state FROM policies_before_failed_rollback EXCEPT SELECT to_jsonb(p) FROM pg_policies p)
  UNION ALL (SELECT to_jsonb(p) FROM pg_policies p EXCEPT SELECT state FROM policies_before_failed_rollback)
),'failed rollback leaves all policies unchanged');
SELECT access_test.assert_true((SELECT bool_and(NOT public) FROM storage.buckets),'failed rollback leaves buckets private');
DROP VIEW access_test.rollback_dependency;
\ir ../../supabase/rollbacks/rollback_14_organization_access_hardening.sql
CREATE TEMP TABLE policies_after_rollback AS SELECT to_jsonb(p) AS state FROM pg_policies p;
-- A consumed/missing snapshot must refuse a second rollback without any changes.
\set ON_ERROR_STOP off
\ir ../../supabase/rollbacks/rollback_14_organization_access_hardening.sql
\set ON_ERROR_STOP on
SELECT access_test.assert_true(NOT EXISTS (
  (SELECT state FROM policies_after_rollback EXCEPT SELECT to_jsonb(p) FROM pg_policies p)
  UNION ALL (SELECT to_jsonb(p) FROM pg_policies p EXCEPT SELECT state FROM policies_after_rollback)
),'missing snapshot leaves policies unchanged');
SELECT access_test.assert_true((SELECT count(*)=3 FROM public.propositions),'failed attempts preserve business rows');
SELECT 'rollback failure checks passed (two expected errors above)' AS result;
