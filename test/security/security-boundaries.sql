\set ON_ERROR_STOP on
-- ONLY in an empty disposable local database. No connection URL is embedded here.
\ir organization-access.sql
\ir ../../supabase/migrations/2026-09-16_proposition_notes_calendars.sql
\ir ../../supabase/migrations/2026-09-20_structured_proposition_notes.sql
\ir ../../supabase/migrations/2026-10-23_template_and_catalogue_sectors.sql
\ir ../../supabase/migrations/2026-10-23_template_secteur_read_grant.sql
\ir ../../supabase/migrations/2026-11-01_member_secteur.sql
\ir ../../supabase/migrations/2026-11-09_sub_templates.sql
\ir ../../supabase/migrations/2026-11-10_sp_variants.sql
GRANT ALL ON public.proposition_notes, public.proposition_note_entries TO authenticated, service_role;
SET request.jwt.claims = '{"role":"service_role"}';
UPDATE public.organizations SET secteur='mixte', stripe_customer_id='cus_fixture', credits=0
WHERE id='11111111-1111-1111-1111-111111111111';
UPDATE public.organization_members SET secteur='telephonie'
WHERE user_id IN ('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444');
UPDATE public.proposition_templates SET secteur='bureautique' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.catalogues_produits(organization_id,nom,secteur_catalogue)
VALUES ('11111111-1111-1111-1111-111111111111','other-sector','bureautique');
INSERT INTO public.proposition_notes(id,organization_id,proposition_id,author_user_id,structure_version,kind,title)
VALUES ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','dddddddd-dddd-dddd-dddd-dddddddddddd','33333333-3333-3333-3333-333333333333',2,'note','A note'),
('10000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','ffffffff-ffff-ffff-ffff-ffffffffffff','22222222-2222-2222-2222-222222222222',2,'note','B note');
\ir ../../supabase/migrations/2026-11-11_security_boundaries.sql
-- Reapplication must remain safe.
\ir ../../supabase/migrations/2026-11-11_security_boundaries.sql

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
SELECT access_test.assert_true(access_test.denied($q$UPDATE public.proposition_notes
 SET organization_id='22222222-2222-2222-2222-222222222222',proposition_id='ffffffff-ffff-ffff-ffff-ffffffffffff'
 WHERE id='10000000-0000-0000-0000-000000000001'$q$),'note cannot move to other tenant');
SELECT access_test.assert_true(access_test.denied($q$UPDATE public.proposition_notes
 SET proposition_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
 WHERE id='10000000-0000-0000-0000-000000000001'$q$),'note cannot move to colleague');
WITH created AS (INSERT INTO public.proposition_notes(organization_id,proposition_id,author_user_id,structure_version,kind,title)
 VALUES ('11111111-1111-1111-1111-111111111111','dddddddd-dddd-dddd-dddd-dddddddddddd','33333333-3333-3333-3333-333333333333',2,'note','allowed') RETURNING id)
SELECT access_test.assert_true((SELECT count(*)=1 FROM created),'own note insert returning works');
INSERT INTO public.proposition_note_entries(id,note_id,organization_id,author_user_id,entry_date,content)
 VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',CURRENT_DATE,'own entry');
SELECT access_test.assert_true(access_test.denied($q$UPDATE public.proposition_note_entries
 SET note_id='10000000-0000-0000-0000-000000000002',organization_id='22222222-2222-2222-2222-222222222222'
 WHERE id='20000000-0000-0000-0000-000000000001'$q$),'entry cannot move to other tenant');
-- Manager permissions and view_all must not override a sector restriction.
SET request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
SELECT access_test.assert_true((SELECT count(*)=0 FROM public.proposition_templates WHERE secteur='bureautique'),'manager cannot read other-sector templates');
SELECT access_test.assert_true((SELECT count(*)=0 FROM public.catalogues_produits WHERE secteur_catalogue='bureautique'),'manager cannot read other-sector catalogue');
SELECT access_test.assert_true((SELECT count(*)=0 FROM public.propositions WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),'view_all cannot read other sector');
SELECT access_test.assert_true(public.can_read_org_storage('11111111-1111-1111-1111-111111111111/master.docx','templates','11111111-1111-1111-1111-111111111111'),'manager can read allowed-sector source');
SELECT access_test.assert_true(NOT public.can_read_org_storage('11111111-1111-1111-1111-111111111111/restricted.docx','templates','11111111-1111-1111-1111-111111111111'),'manager cannot read other-sector source');
WITH changed AS (UPDATE storage.objects SET metadata='{}' WHERE name='11111111-1111-1111-1111-111111111111/restricted.docx' RETURNING id)
SELECT access_test.assert_true((SELECT count(*)=0 FROM changed),'manager cannot overwrite other-sector source');
SELECT access_test.assert_true(access_test.denied($q$INSERT INTO public.catalogues_produits(organization_id,nom,secteur_catalogue)
 VALUES('11111111-1111-1111-1111-111111111111','denied','bureautique')$q$),'manager cannot write other sector');
SELECT access_test.assert_true(access_test.denied($q$SELECT public.settle_credit_checkout('cs_fixture','11111111-1111-1111-1111-111111111111',10000,'cus_fixture','pi_fixture')$q$),'settlement not callable by member');
RESET ROLE;
SET request.jwt.claims = '{"role":"service_role"}';
INSERT INTO public.stripe_transactions(organization_id,stripe_session_id,montant,credits_ajoutes,statut)
 VALUES ('11111111-1111-1111-1111-111111111111','cs_fixture',100,1005,'pending');
SET ROLE service_role;
SELECT access_test.assert_true(public.settle_credit_checkout('cs_fixture','11111111-1111-1111-1111-111111111111',10000,'cus_fixture','pi_fixture'),'first settlement succeeds');
SELECT access_test.assert_true(NOT public.settle_credit_checkout('cs_fixture','11111111-1111-1111-1111-111111111111',10000,'cus_fixture','pi_fixture'),'replay ignored');
RESET ROLE;
SELECT access_test.assert_true((SELECT credits=105 FROM public.organizations WHERE id='11111111-1111-1111-1111-111111111111'),'balance uses amount not inflated metadata');
SELECT access_test.assert_true((SELECT credits_ajoutes=105 AND statut='succeeded' FROM public.stripe_transactions WHERE stripe_session_id='cs_fixture'),'credit and status committed together');
CREATE FUNCTION access_test.settlement_rejected(statement text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN raise_exception THEN RETURN true; END $$;
GRANT EXECUTE ON FUNCTION access_test.settlement_rejected(text) TO service_role;
INSERT INTO public.stripe_transactions(organization_id,stripe_session_id,montant,credits_ajoutes,statut)
 VALUES ('11111111-1111-1111-1111-111111111111','cs_mismatch',100,105,'pending');
SET ROLE service_role;
SELECT access_test.assert_true(access_test.settlement_rejected($q$SELECT public.settle_credit_checkout('cs_mismatch','11111111-1111-1111-1111-111111111111',10001,'cus_fixture','pi_mismatch')$q$),'wrong amount is rejected');
SELECT access_test.assert_true(access_test.settlement_rejected($q$SELECT public.settle_credit_checkout('cs_mismatch','11111111-1111-1111-1111-111111111111',10000,'cus_other','pi_mismatch')$q$),'wrong customer is rejected');
RESET ROLE;
SELECT access_test.assert_true((SELECT credits=105 FROM public.organizations WHERE id='11111111-1111-1111-1111-111111111111'),'failed settlement preserves balance');
SELECT access_test.assert_true((SELECT statut='pending' FROM public.stripe_transactions WHERE stripe_session_id='cs_mismatch'),'failed settlement preserves transaction');
SELECT 'security boundary regression checks passed' AS result;
