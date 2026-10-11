-- Restore the snapshot taken BEFORE 2026-10-11_organization_access_hardening.sql.
-- Run as the same database migration administrator, together with the previous app release.
-- Restores former access rules, including their security weaknesses and public buckets.
-- No business rows or stored files are deleted. Any failure rolls back the whole operation.
BEGIN;
DO $rollback$
DECLARE
  snapshot jsonb; item jsonb; col jsonb; acl jsonb; policy_row record; r record;
  qualified text; role_sql text; roles_sql text; statement text;
BEGIN
  IF to_regclass('organization_access_backup.hardening_20261011') IS NULL THEN
    RAISE EXCEPTION 'Pre-migration snapshot missing. Stop: do not guess previous policies or grants.';
  END IF;
  SELECT state INTO snapshot FROM organization_access_backup.hardening_20261011 WHERE singleton;
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Pre-migration snapshot is empty'; END IF;

  FOR policy_row IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN ('organizations', 'catalogues_produits',
      'proposition_templates', 'propositions', 'usage_analytics', 'stripe_transactions',
      'proposition_attachments', 'prompt_defaults')) OR (schemaname = 'storage' AND tablename = 'objects')
  LOOP EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename); END LOOP;
  DROP TRIGGER IF EXISTS guard_organization_records ON public.propositions;
  DROP TRIGGER IF EXISTS guard_organization_records ON public.proposition_templates;

  -- Preserve any function that already existed, and remove only functions introduced here.
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'functions')
  LOOP
    IF item->>'definition' IS NOT NULL THEN EXECUTE item->>'definition'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'functions') WITH ORDINALITY f(value, position) ORDER BY position DESC
  LOOP
    IF item->>'definition' IS NULL THEN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || (item->>'identity'); -- RESTRICT, never CASCADE
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'tables') LOOP
    qualified := format('%I.%I', item->>'schema', item->>'name');
    FOR r IN SELECT DISTINCT a.grantee FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
      LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE n.nspname = item->>'schema' AND c.relname = item->>'name'
    LOOP
      role_sql := CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %s', qualified, role_sql);
    END LOOP;
    FOR col IN SELECT value FROM jsonb_array_elements(item->'columns') LOOP
      FOR r IN SELECT DISTINCT a.grantee FROM pg_attribute c,
        LATERAL aclexplode(c.attacl) a WHERE c.attrelid = qualified::regclass AND c.attname = col->>'name'
      LOOP
        role_sql := CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE %s FROM %s', col->>'name', qualified, role_sql);
      END LOOP;
      FOR acl IN SELECT value FROM jsonb_array_elements(col->'acl') LOOP
        role_sql := CASE WHEN acl->>'role' = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(acl->>'role') END;
        EXECUTE format('GRANT %s (%I) ON TABLE %s TO %s%s', acl->>'privilege', col->>'name', qualified,
          role_sql, CASE WHEN (acl->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
      END LOOP;
    END LOOP;
    FOR acl IN SELECT value FROM jsonb_array_elements(item->'acl') LOOP
      role_sql := CASE WHEN acl->>'role' = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(acl->>'role') END;
      EXECUTE format('GRANT %s ON TABLE %s TO %s%s', acl->>'privilege', qualified, role_sql,
        CASE WHEN (acl->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'functions') LOOP
    IF item->>'definition' IS NULL THEN CONTINUE; END IF;
    FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = to_regprocedure(item->>'identity')
    LOOP
      role_sql := CASE WHEN r.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s', item->>'identity', role_sql);
    END LOOP;
    FOR acl IN SELECT value FROM jsonb_array_elements(item->'acl') LOOP
      role_sql := CASE WHEN acl->>'role' = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(acl->>'role') END;
      EXECUTE format('GRANT %s ON FUNCTION %s TO %s%s', acl->>'privilege', item->>'identity', role_sql,
        CASE WHEN (acl->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'policies') LOOP
    SELECT string_agg(CASE WHEN role_name = 'public' THEN 'PUBLIC' ELSE quote_ident(role_name) END, ', ')
      INTO roles_sql FROM jsonb_array_elements_text(item->'roles') role_names(role_name);
    statement := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s', item->>'policyname',
      item->>'schemaname', item->>'tablename', item->>'permissive', item->>'cmd', roles_sql);
    IF item->>'qual' IS NOT NULL THEN statement := statement || ' USING (' || (item->>'qual') || ')'; END IF;
    IF item->>'with_check' IS NOT NULL THEN statement := statement || ' WITH CHECK (' || (item->>'with_check') || ')'; END IF;
    EXECUTE statement;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'triggers') LOOP EXECUTE item #>> '{}'; END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'buckets') LOOP
    UPDATE storage.buckets SET public = (item->>'public')::boolean WHERE id = item->>'id';
  END LOOP;
  -- Delete only the consumed snapshot. A later migration captures a fresh baseline.
  DELETE FROM organization_access_backup.hardening_20261011 WHERE singleton;
END
$rollback$;
COMMIT;
