-- Apply with the matching application release. No remote database is modified by this file.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT COALESCE(auth.jwt()->'app_metadata'->>'role' = 'admin', false) $$;

CREATE OR REPLACE FUNCTION public.org_permission(target_org uuid, permission_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    target_org = auth.uid() OR public.is_platform_admin() OR EXISTS (
      SELECT 1 FROM public.organization_members m
      JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.organization_id = target_org AND m.user_id = auth.uid() AND m.actif
      AND COALESCE((m.permissions_override->>permission_name)::boolean,
        (o.commercial_default_permissions->>permission_name)::boolean,
        permission_name IN ('download_proposition', 'download_comparatif_sa_sp'))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_proposition(target_org uuid, creator uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT public.is_platform_admin() OR (public.is_org_member(target_org)
  AND (target_org = auth.uid() OR creator = auth.uid() OR public.org_permission(target_org, 'view_all_propositions'))) $$;

CREATE OR REPLACE FUNCTION public.can_use_org_template(target_org uuid, target_template uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.proposition_templates t WHERE t.id = target_template AND t.organization_id = target_org)
  AND (public.is_platform_admin() OR target_org = auth.uid() OR EXISTS (
    SELECT 1 FROM public.organization_members m WHERE m.organization_id = target_org
      AND m.user_id = auth.uid() AND m.actif
      AND (m.allowed_template_ids IS NULL OR target_template = ANY(m.allowed_template_ids))
  ));
$$;

CREATE OR REPLACE FUNCTION public.can_read_org_template(target_org uuid, target_template uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.org_permission(target_org, 'manage_templates')
  OR public.can_use_org_template(target_org, target_template)
  OR EXISTS (SELECT 1 FROM public.propositions p WHERE p.organization_id = target_org
    AND p.template_id = target_template AND public.can_access_proposition(p.organization_id, p.created_by)) $$;

-- Replace every historical policy on these tables: permissive policies combine with OR.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('catalogues_produits', 'proposition_templates', 'propositions', 'usage_analytics', 'stripe_transactions', 'proposition_attachments')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename); END LOOP;
END $$;

CREATE POLICY catalogue_read ON public.catalogues_produits FOR SELECT TO authenticated
USING (public.is_platform_admin() OR organization_id IS NULL OR public.is_org_member(organization_id));
CREATE POLICY catalogue_write ON public.catalogues_produits FOR ALL TO authenticated
USING (public.is_platform_admin() OR (organization_id IS NOT NULL AND public.org_permission(organization_id, 'manage_catalogue')))
WITH CHECK (public.is_platform_admin() OR (organization_id IS NOT NULL AND public.org_permission(organization_id, 'manage_catalogue') AND NOT est_produit_base));

CREATE POLICY template_read ON public.proposition_templates FOR SELECT TO authenticated
USING (public.can_read_org_template(organization_id, id));
CREATE POLICY template_insert ON public.proposition_templates FOR INSERT TO authenticated
WITH CHECK (public.org_permission(organization_id, 'manage_templates'));
CREATE POLICY template_update ON public.proposition_templates FOR UPDATE TO authenticated
USING (public.org_permission(organization_id, 'manage_templates')) WITH CHECK (public.org_permission(organization_id, 'manage_templates'));
CREATE POLICY template_delete ON public.proposition_templates FOR DELETE TO authenticated
USING (public.org_permission(organization_id, 'manage_templates'));

CREATE POLICY proposition_read ON public.propositions FOR SELECT TO authenticated
USING (public.can_access_proposition(organization_id, created_by));
CREATE POLICY proposition_insert ON public.propositions FOR INSERT TO authenticated
WITH CHECK ((public.is_platform_admin() OR (public.is_org_member(organization_id) AND created_by = auth.uid()))
  AND public.can_use_org_template(organization_id, template_id));
CREATE POLICY proposition_update ON public.propositions FOR UPDATE TO authenticated
USING (public.can_access_proposition(organization_id, created_by)) WITH CHECK (public.can_access_proposition(organization_id, created_by));
CREATE POLICY proposition_delete ON public.propositions FOR DELETE TO authenticated
USING (public.can_access_proposition(organization_id, created_by));
CREATE POLICY analytics_read ON public.usage_analytics FOR SELECT TO authenticated
USING (public.org_permission(organization_id, 'view_all_propositions') AND public.org_permission(organization_id, 'view_credits_billing'));
CREATE POLICY transactions_read ON public.stripe_transactions FOR SELECT TO authenticated
USING (public.org_permission(organization_id, 'view_credits_billing'));
-- Payment rows are written only by trusted server operations / webhooks.
REVOKE INSERT, UPDATE, DELETE ON public.stripe_transactions FROM anon, authenticated;
CREATE POLICY attachment_read ON public.proposition_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.propositions p WHERE p.id = proposition_id
  AND p.organization_id = proposition_attachments.organization_id
  AND public.can_access_proposition(p.organization_id, p.created_by)));

-- Column grants protect internal AI/billing data even through direct REST SELECT.
-- Public organization/profile and template fields remain readable under RLS.
DO $$ DECLARE t text; c record; cols text; private_cols text[]; BEGIN
  FOREACH t IN ARRAY ARRAY['organizations', 'proposition_templates'] LOOP
    private_cols := CASE WHEN t = 'organizations' THEN ARRAY['prompt_template','prompt_version','claude_model','quotas','stripe_customer_id','credits','tarif_par_proposition','tarif_clone_site','preferences','numero_tva','nom_facturation','adresse_facturation','email_facturation','adresse_ligne1_facturation','adresse_ligne2_facturation','ville_facturation','code_postal_facturation','pays_facturation','telephone_facturation']
      ELSE ARRAY['prompt_template','claude_model'] END;
    EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated', t);
    FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t LOOP
      EXECUTE format('REVOKE SELECT (%I) ON public.%I FROM PUBLIC, anon, authenticated', c.column_name, t);
    END LOOP;
    SELECT string_agg(quote_ident(column_name), ', ') INTO cols FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND NOT (column_name = ANY(private_cols));
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t);
  END LOOP;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon, authenticated;
DROP POLICY IF EXISTS "Authenticated can view prompt defaults" ON public.prompt_defaults;
DROP POLICY IF EXISTS prompt_defaults_admin_read ON public.prompt_defaults;
CREATE POLICY prompt_defaults_admin_read ON public.prompt_defaults FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Direct table updates cannot move rows between tenants or replace trusted AI settings.
CREATE OR REPLACE FUNCTION public.guard_organization_records()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Tenant identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'propositions' THEN
    IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid();
    ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Proposition creator is immutable' USING ERRCODE = '42501';
    END IF;
    IF (TG_OP = 'INSERT' OR NEW.template_id IS DISTINCT FROM OLD.template_id)
      AND NOT public.can_use_org_template(NEW.organization_id, NEW.template_id) THEN
      RAISE EXCEPTION 'Template forbidden' USING ERRCODE = '42501';
    END IF;
    -- Source and output references must be validated by the API, never set through REST.
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.source_documents, '[]'::jsonb) <> '[]'::jsonb OR NEW.duplicated_template_url IS NOT NULL THEN
        RAISE EXCEPTION 'Storage references require server validation' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.source_documents IS DISTINCT FROM OLD.source_documents OR NEW.duplicated_template_url IS DISTINCT FROM OLD.duplicated_template_url THEN
      RAISE EXCEPTION 'Storage references require server validation' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'proposition_templates' THEN
    IF TG_OP = 'INSERT' THEN NEW.prompt_template := NULL; NEW.claude_model := NULL;
    ELSIF NEW.prompt_template IS DISTINCT FROM OLD.prompt_template OR NEW.claude_model IS DISTINCT FROM OLD.claude_model THEN
      RAISE EXCEPTION 'AI configuration is private' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_organization_records ON public.propositions;
CREATE TRIGGER guard_organization_records BEFORE INSERT OR UPDATE ON public.propositions FOR EACH ROW EXECUTE FUNCTION public.guard_organization_records();
DROP TRIGGER IF EXISTS guard_organization_records ON public.proposition_templates;
CREATE TRIGGER guard_organization_records BEFORE INSERT OR UPDATE ON public.proposition_templates FOR EACH ROW EXECUTE FUNCTION public.guard_organization_records();

-- Storage buckets cannot be public: URLs must be authorized by Storage or server routes.
UPDATE storage.buckets SET public = false WHERE id IN ('documents','templates','propositions','proposition-attachments');
DROP POLICY IF EXISTS "Service can create propositions" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_read_org_storage(object_name text, object_bucket text, object_owner text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage
AS $$
  SELECT public.is_platform_admin() OR (public.is_org_member(public.storage_org_id(object_name)) AND (
    public.storage_org_id(object_name) = auth.uid()
    OR (object_bucket = 'documents' AND (object_owner = auth.uid()::text OR EXISTS (
      SELECT 1 FROM public.propositions p WHERE public.can_access_proposition(p.organization_id, p.created_by)
        AND p.organization_id = public.storage_org_id(object_name)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.source_documents) = 'array' THEN p.source_documents ELSE '[]'::jsonb END) u(url)
          WHERE right(split_part(u.url, '?', 1), length(object_name) + 1) = '/' || object_name)
    )))
    OR (object_bucket = 'templates' AND object_name NOT LIKE 'generated/%' AND (
      public.org_permission(public.storage_org_id(object_name), 'manage_templates') OR EXISTS (
        SELECT 1 FROM public.proposition_templates t WHERE t.organization_id = public.storage_org_id(object_name)
          AND public.can_read_org_template(t.organization_id, t.id)
          AND right(split_part(t.file_url, '?', 1), length(object_name) + 1) = '/' || object_name
      )
    ))
    OR (object_bucket IN ('templates','propositions') AND public.org_permission(public.storage_org_id(object_name), 'download_proposition') AND EXISTS (
      SELECT 1 FROM public.propositions p WHERE p.organization_id = public.storage_org_id(object_name)
        AND public.can_access_proposition(p.organization_id, p.created_by)
        AND right(split_part(p.duplicated_template_url, '?', 1), length(object_name) + 1) = '/' || object_name
    ))
  ));
$$;

DROP POLICY IF EXISTS "Users can read their own templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own propositions" ON storage.objects;
DROP POLICY IF EXISTS organization_storage_read ON storage.objects;
DROP POLICY IF EXISTS template_storage_insert ON storage.objects;
DROP POLICY IF EXISTS template_storage_update ON storage.objects;
DROP POLICY IF EXISTS template_storage_delete ON storage.objects;
DROP POLICY IF EXISTS document_storage_insert ON storage.objects;
DROP POLICY IF EXISTS document_storage_delete ON storage.objects;
CREATE POLICY organization_storage_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('templates','documents','propositions') AND public.can_read_org_storage(name, bucket_id, COALESCE(owner::text, to_jsonb(objects)->>'owner_id')));
DROP POLICY IF EXISTS "Users can upload their own templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own templates" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own templates" ON storage.objects;
CREATE POLICY template_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'templates' AND name NOT LIKE 'generated/%' AND public.org_permission(public.storage_org_id(name), 'manage_templates'));
CREATE POLICY template_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'templates' AND name NOT LIKE 'generated/%' AND public.org_permission(public.storage_org_id(name), 'manage_templates'))
WITH CHECK (bucket_id = 'templates' AND name NOT LIKE 'generated/%' AND public.org_permission(public.storage_org_id(name), 'manage_templates'));
CREATE POLICY template_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'templates' AND name NOT LIKE 'generated/%' AND public.org_permission(public.storage_org_id(name), 'manage_templates'));
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
CREATE POLICY document_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND public.is_org_member(public.storage_org_id(name)));
CREATE POLICY document_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.is_org_member(public.storage_org_id(name))
  AND (public.storage_org_id(name) = auth.uid() OR owner = auth.uid() OR to_jsonb(objects)->>'owner_id' = auth.uid()::text));

REVOKE ALL ON FUNCTION public.org_permission(uuid,text), public.can_use_org_template(uuid,uuid), public.can_read_org_template(uuid,uuid), public.can_read_org_storage(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_permission(uuid,text), public.can_use_org_template(uuid,uuid), public.can_read_org_template(uuid,uuid), public.can_read_org_storage(text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid,numeric), public.debit_credits(uuid,numeric), public.update_analytics(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid,numeric), public.debit_credits(uuid,numeric), public.update_analytics(uuid,uuid) TO service_role;
COMMIT;
