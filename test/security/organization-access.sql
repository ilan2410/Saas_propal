\set ON_ERROR_STOP on
-- Run only against an empty, disposable PostgreSQL database:
-- psql -f test/security/organization-access.sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id text, name text, owner uuid, metadata jsonb, path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED, created_at timestamptz DEFAULT now());
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1, '/') $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
\ir ../../supabase/schema.sql
CREATE TABLE public.catalogues_produits (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, nom text, est_produit_base boolean DEFAULT false);
ALTER TABLE public.catalogues_produits ENABLE ROW LEVEL SECURITY;
\ir ../../supabase/migrations/2026-08-25_organization_members.sql
ALTER TABLE public.organization_members ADD COLUMN allowed_template_ids uuid[];
ALTER TABLE public.organizations ADD COLUMN preferences jsonb DEFAULT '{}';
CREATE TABLE public.proposition_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, proposition_id uuid, storage_key text);
ALTER TABLE public.proposition_attachments ENABLE ROW LEVEL SECURITY;
\ir ../../supabase/storage.sql
\ir ../../supabase/migrations/2026-09-30_storage_orphans_and_rls_fix.sql
GRANT USAGE ON SCHEMA public, storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public, storage TO authenticated, service_role;

INSERT INTO auth.users(id, email) VALUES
 ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
 ('22222222-2222-2222-2222-222222222222', 'other@example.test'),
 ('33333333-3333-3333-3333-333333333333', 'restricted@example.test'),
 ('44444444-4444-4444-4444-444444444444', 'manager@example.test'),
 ('55555555-5555-5555-5555-555555555555', 'disabled@example.test');
INSERT INTO public.organizations(id,nom,email,prompt_template,preferences) VALUES
 ('11111111-1111-1111-1111-111111111111','A','owner@example.test','private prompt','{"recharge_auto":{"actif":true}}'),
 ('22222222-2222-2222-2222-222222222222','B','other@example.test','private prompt B','{}');
INSERT INTO public.proposition_templates(id,organization_id,nom,file_url,file_name,file_type,prompt_template) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','allowed','https://project.test/storage/v1/object/public/templates/11111111-1111-1111-1111-111111111111/master.docx','master.docx','word','private template prompt'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','restricted','https://project.test/storage/v1/object/public/templates/11111111-1111-1111-1111-111111111111/restricted.docx','restricted.docx','word','private prompt'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222','other','https://project.test/storage/v1/object/public/templates/22222222-2222-2222-2222-222222222222/master.docx','master.docx','word','private prompt');
INSERT INTO public.organization_members(organization_id,user_id,permissions_override,actif,allowed_template_ids) VALUES
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','{"download_proposition":false}',true,ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[]),
 ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','{"manage_catalogue":true,"manage_templates":true,"view_all_propositions":true}',true,NULL),
 ('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','{}',false,NULL);
INSERT INTO public.propositions(id,organization_id,created_by,template_id,source_documents,duplicated_template_url) VALUES
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','["https://project.test/storage/v1/object/public/documents/11111111-1111-1111-1111-111111111111/own.pdf"]','https://project.test/storage/v1/object/public/templates/generated/11111111-1111-1111-1111-111111111111/own.docx'),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','["https://project.test/storage/v1/object/public/documents/11111111-1111-1111-1111-111111111111/other.pdf"]',NULL),
 ('ffffffff-ffff-ffff-ffff-ffffffffffff','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','cccccccc-cccc-cccc-cccc-cccccccccccc','[]',NULL);
INSERT INTO storage.objects(bucket_id,name,owner) VALUES
 ('documents','11111111-1111-1111-1111-111111111111/own.pdf','33333333-3333-3333-3333-333333333333'),
 ('documents','11111111-1111-1111-1111-111111111111/other.pdf','11111111-1111-1111-1111-111111111111'),
 ('templates','generated/11111111-1111-1111-1111-111111111111/own.docx',NULL),
 ('templates','11111111-1111-1111-1111-111111111111/master.docx','11111111-1111-1111-1111-111111111111'),
 ('templates','11111111-1111-1111-1111-111111111111/restricted.docx','11111111-1111-1111-1111-111111111111'),
 ('documents','22222222-2222-2222-2222-222222222222/secret.pdf','22222222-2222-2222-2222-222222222222');
INSERT INTO public.catalogues_produits(organization_id,nom,est_produit_base) VALUES (NULL,'global',true),('11111111-1111-1111-1111-111111111111','local',false);
INSERT INTO public.stripe_transactions(organization_id,montant,credits_ajoutes,statut) VALUES ('11111111-1111-1111-1111-111111111111',100,100,'succeeded');
CREATE TABLE public.prompt_defaults(secteur text PRIMARY KEY,prompt_template text);
ALTER TABLE public.prompt_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view prompt defaults" ON public.prompt_defaults FOR SELECT USING (auth.uid() IS NOT NULL);
GRANT SELECT ON public.prompt_defaults TO authenticated;
INSERT INTO public.prompt_defaults VALUES ('telephonie','private default');
\ir ../../supabase/migrations/2026-10-11_organization_access_hardening.sql

CREATE SCHEMA access_test;
CREATE FUNCTION access_test.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION access_test.denied(statement text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN insufficient_privilege THEN RETURN true; END $$;
GRANT USAGE ON SCHEMA access_test TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA access_test TO authenticated, anon, service_role;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"commercial"}}';
SELECT access_test.assert_true((SELECT count(*) = 1 FROM public.propositions),'restricted member sees only own proposal');
SELECT access_test.assert_true((SELECT count(*) = 1 FROM public.proposition_templates),'restricted template list');
SELECT access_test.assert_true((SELECT count(*) = 0 FROM public.stripe_transactions),'no billing access');
SELECT access_test.assert_true((SELECT count(*) = 0 FROM public.prompt_defaults),'no private default prompts');
SELECT access_test.assert_true(access_test.denied('SELECT credits FROM public.organizations'),'direct credits denied');
SELECT access_test.assert_true(access_test.denied('SELECT preferences FROM public.organizations'),'direct billing preferences denied');
SELECT access_test.assert_true(access_test.denied('SELECT prompt_template FROM public.proposition_templates'),'direct prompt denied');
WITH changed AS (UPDATE public.proposition_templates SET nom='hacked' RETURNING id) SELECT access_test.assert_true((SELECT count(*) = 0 FROM changed),'template writes denied without permission');
SELECT access_test.assert_true(access_test.denied('INSERT INTO public.catalogues_produits(organization_id,nom) VALUES(NULL,''hacked'')'),'global insert denied');
WITH changed AS (DELETE FROM public.catalogues_produits WHERE organization_id IS NULL RETURNING id) SELECT access_test.assert_true((SELECT count(*) = 0 FROM changed),'global delete denied');
WITH changed AS (UPDATE public.propositions SET nom_client='hacked' WHERE created_by <> auth.uid() RETURNING id) SELECT access_test.assert_true((SELECT count(*) = 0 FROM changed),'colleague update denied');
SELECT access_test.assert_true(access_test.denied('UPDATE public.propositions SET created_by=''11111111-1111-1111-1111-111111111111'' WHERE id=''dddddddd-dddd-dddd-dddd-dddddddddddd'''),'creator cannot be reassigned');
SELECT access_test.assert_true(access_test.denied('UPDATE public.propositions SET source_documents=''["https://evil.test/documents/22222222-2222-2222-2222-222222222222/secret.pdf"]'''),'direct source injection denied');
SELECT access_test.assert_true((SELECT count(*) = 2 FROM storage.objects),'only own document and allowed master readable');
SELECT access_test.assert_true(access_test.denied('INSERT INTO storage.objects(bucket_id,name) VALUES(''templates'',''11111111-1111-1111-1111-111111111111/hacked.docx'')'),'template upload denied');
WITH changed AS (DELETE FROM storage.objects WHERE name LIKE '%other.pdf' RETURNING id) SELECT access_test.assert_true((SELECT count(*) = 0 FROM changed),'colleague document delete denied');

SET request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"commercial"}}';
SELECT access_test.assert_true((SELECT count(*) = 2 FROM public.propositions),'view all stays within tenant');
SELECT access_test.assert_true((SELECT count(*) = 0 FROM public.stripe_transactions),'view all does not imply billing');
WITH changed AS (UPDATE public.catalogues_produits SET nom='hacked' WHERE organization_id IS NULL RETURNING id) SELECT access_test.assert_true((SELECT count(*) = 0 FROM changed),'manager cannot modify global catalogue');
UPDATE public.catalogues_produits SET nom='permitted local edit' WHERE organization_id = '11111111-1111-1111-1111-111111111111';
UPDATE public.proposition_templates SET nom='permitted template edit' WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT access_test.assert_true(access_test.denied('UPDATE public.proposition_templates SET claude_model=''arbitrary-model'''),'manager cannot override private AI model');

SET request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
SELECT access_test.assert_true((SELECT count(*) = 0 FROM public.propositions),'inactive member denied');
SELECT access_test.assert_true((SELECT count(*) = 0 FROM storage.objects),'inactive member storage denied');

SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"client"}}';
SELECT access_test.assert_true((SELECT count(*) = 2 FROM public.propositions),'owner tenant proposals');
SELECT access_test.assert_true((SELECT count(*) = 1 FROM public.stripe_transactions),'owner billing');
SELECT access_test.assert_true((SELECT count(*) = 5 FROM storage.objects),'owner storage scope');
SELECT access_test.assert_true(access_test.denied('INSERT INTO public.stripe_transactions(organization_id,montant,credits_ajoutes) VALUES(auth.uid(),100,100)'),'owner cannot fabricate transactions');
SELECT access_test.assert_true(access_test.denied('SELECT public.debit_credits(auth.uid(),-1000)'),'owner cannot invoke credit RPCs');

SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","user_metadata":{"role":"admin"}}';
SELECT access_test.assert_true((SELECT count(*) = 1 FROM public.propositions),'user metadata cannot grant platform admin access');

SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT access_test.assert_true((SELECT count(*) = 3 FROM public.propositions),'admin sees all proposals');
UPDATE public.catalogues_produits SET nom='permitted admin edit' WHERE organization_id IS NULL;
RESET ROLE;
SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
SELECT access_test.assert_true((SELECT count(*) = 2 FROM public.organizations WHERE prompt_template IS NOT NULL),'service internal settings');
UPDATE public.propositions SET source_documents='[]' WHERE id='dddddddd-dddd-dddd-dddd-dddddddddddd';
RESET ROLE;
-- Reapplying the production migration must be safe.
\ir ../../supabase/migrations/2026-10-11_organization_access_hardening.sql
SELECT 'organization access integration checks passed' AS result;
