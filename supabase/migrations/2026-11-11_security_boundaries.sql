-- Apply after 2026-11-10_sp_variants.sql, together with the matching application.
-- No external service calls. This migration does not rewrite business records.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_org_sector(target_org uuid, resource_sector text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = auth.uid()
      AND (target_org IS NULL OR o.id = target_org))
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.user_id = auth.uid() AND m.actif
        AND (target_org IS NULL OR m.organization_id = target_org)
        AND (o.secteur IS DISTINCT FROM 'mixte' OR m.secteur IS NULL OR m.secteur = resource_sector)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_proposition_sector(target_org uuid, target_template uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_org_sector(target_org,
    (SELECT t.secteur FROM public.proposition_templates t
     WHERE t.id = target_template AND t.organization_id = target_org));
$$;

CREATE OR REPLACE FUNCTION public.can_access_proposition_row(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.propositions p WHERE p.id = target_id
    AND public.can_access_proposition(p.organization_id, p.created_by)
    AND public.can_access_proposition_sector(p.organization_id, p.template_id));
$$;

CREATE OR REPLACE FUNCTION public.can_use_org_template(target_org uuid, target_template uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.proposition_templates t
    WHERE t.id = target_template AND t.organization_id = target_org
      AND public.can_access_org_sector(target_org, t.secteur))
    AND (public.is_platform_admin() OR target_org = auth.uid() OR EXISTS (
      SELECT 1 FROM public.organization_members m WHERE m.organization_id = target_org
        AND m.user_id = auth.uid() AND m.actif
        AND (m.allowed_template_ids IS NULL OR target_template = ANY(m.allowed_template_ids))
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_read_org_template(target_org uuid, target_template uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.proposition_templates t
    WHERE t.id = target_template AND t.organization_id = target_org
      AND public.can_access_org_sector(target_org, t.secteur))
    AND (public.org_permission(target_org, 'manage_templates')
      OR public.can_use_org_template(target_org, target_template)
      OR EXISTS (SELECT 1 FROM public.propositions p WHERE p.organization_id = target_org
        AND p.template_id = target_template AND public.can_access_proposition_row(p.id)));
$$;

-- Restrictive policies also constrain existing permissive FOR ALL management policies.
DROP POLICY IF EXISTS sector_catalogue ON public.catalogues_produits;
CREATE POLICY sector_catalogue ON public.catalogues_produits AS RESTRICTIVE FOR ALL TO authenticated
USING (public.can_access_org_sector(organization_id, secteur_catalogue))
WITH CHECK (public.can_access_org_sector(organization_id, secteur_catalogue));
DROP POLICY IF EXISTS sector_templates ON public.proposition_templates;
CREATE POLICY sector_templates ON public.proposition_templates AS RESTRICTIVE FOR ALL TO authenticated
USING (public.can_access_org_sector(organization_id, secteur))
WITH CHECK (public.can_access_org_sector(organization_id, secteur));
DROP POLICY IF EXISTS sector_propositions ON public.propositions;
CREATE POLICY sector_propositions ON public.propositions AS RESTRICTIVE FOR ALL TO authenticated
USING (public.can_access_proposition_sector(organization_id, template_id))
WITH CHECK (public.can_access_proposition_sector(organization_id, template_id));
DROP POLICY IF EXISTS attachment_read ON public.proposition_attachments;
CREATE POLICY attachment_read ON public.proposition_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.propositions p WHERE p.id = proposition_id
  AND p.organization_id = proposition_attachments.organization_id
  AND public.can_access_proposition_row(p.id)));

CREATE OR REPLACE FUNCTION public.can_read_org_storage(object_name text, object_bucket text, object_owner text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT public.is_platform_admin() OR (public.is_org_member(public.storage_org_id(object_name)) AND (
    public.storage_org_id(object_name) = auth.uid()
    OR (object_bucket = 'documents' AND (object_owner = auth.uid()::text OR EXISTS (
      SELECT 1 FROM public.propositions p WHERE public.can_access_proposition_row(p.id)
        AND p.organization_id = public.storage_org_id(object_name)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p.source_documents) = 'array' THEN p.source_documents ELSE '[]'::jsonb END) u(url)
          WHERE right(split_part(u.url, '?', 1), length(object_name) + 1) = '/' || object_name)
    )))
    OR (object_bucket = 'templates' AND object_name NOT LIKE 'generated/%' AND (EXISTS (
      SELECT 1 FROM public.proposition_templates t WHERE t.organization_id = public.storage_org_id(object_name)
        AND public.can_read_org_template(t.organization_id, t.id)
        AND right(split_part(t.file_url, '?', 1), length(object_name) + 1) = '/' || object_name
    ) OR EXISTS (
      SELECT 1 FROM public.template_sub_templates st
      WHERE st.organization_id = public.storage_org_id(object_name)
        AND public.can_read_org_template(st.organization_id, st.template_id)
        AND right(split_part(st.file_url, '?', 1), length(object_name) + 1) = '/' || object_name
    ) OR (object_owner = auth.uid()::text
      AND public.org_permission(public.storage_org_id(object_name), 'manage_templates')
      AND NOT EXISTS (SELECT 1 FROM public.proposition_templates t
        WHERE right(split_part(t.file_url, '?', 1), length(object_name) + 1) = '/' || object_name)
      AND NOT EXISTS (SELECT 1 FROM public.template_sub_templates st
        WHERE right(split_part(st.file_url, '?', 1), length(object_name) + 1) = '/' || object_name)
    )))
    OR (object_bucket IN ('templates', 'propositions')
      AND public.org_permission(public.storage_org_id(object_name), 'download_proposition') AND (EXISTS (
      SELECT 1 FROM public.propositions p WHERE p.organization_id = public.storage_org_id(object_name)
        AND public.can_access_proposition_row(p.id)
        AND right(split_part(p.duplicated_template_url, '?', 1), length(object_name) + 1) = '/' || object_name
    ) OR EXISTS (
      SELECT 1 FROM public.proposition_sub_template_results r JOIN public.propositions p ON p.id = r.proposition_id
      WHERE r.organization_id = p.organization_id AND p.organization_id = public.storage_org_id(object_name)
        AND public.can_access_proposition_row(p.id)
        AND right(split_part(r.file_url, '?', 1), length(object_name) + 1) = '/' || object_name
    ) OR EXISTS (
      SELECT 1 FROM public.proposition_sp_variants v JOIN public.propositions p ON p.id = v.proposition_id
      WHERE v.organization_id = p.organization_id AND p.organization_id = public.storage_org_id(object_name)
        AND public.can_access_proposition_row(p.id)
        AND right(split_part(v.duplicated_template_url, '?', 1), length(object_name) + 1) = '/' || object_name
    ) OR EXISTS (
      SELECT 1 FROM public.proposition_sp_variant_results r
      JOIN public.proposition_sp_variants v ON v.id = r.variant_id
      JOIN public.propositions p ON p.id = v.proposition_id
      WHERE r.organization_id = p.organization_id AND v.organization_id = p.organization_id
        AND p.organization_id = public.storage_org_id(object_name) AND public.can_access_proposition_row(p.id)
        AND right(split_part(r.file_url, '?', 1), length(object_name) + 1) = '/' || object_name
    )))
  ));
$$;

-- A sector-restricted manager cannot overwrite another sector's source object.
DROP POLICY IF EXISTS template_storage_update ON storage.objects;
CREATE POLICY template_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'templates' AND name NOT LIKE 'generated/%'
  AND public.org_permission(public.storage_org_id(name), 'manage_templates')
  AND public.can_read_org_storage(name, bucket_id, COALESCE(to_jsonb(objects)->>'owner_id', owner::text)))
WITH CHECK (bucket_id = 'templates' AND name NOT LIKE 'generated/%'
  AND public.org_permission(public.storage_org_id(name), 'manage_templates')
  AND public.can_read_org_storage(name, bucket_id, COALESCE(to_jsonb(objects)->>'owner_id', owner::text)));
DROP POLICY IF EXISTS template_storage_delete ON storage.objects;
CREATE POLICY template_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'templates' AND name NOT LIKE 'generated/%'
  AND public.org_permission(public.storage_org_id(name), 'manage_templates')
  AND public.can_read_org_storage(name, bucket_id, COALESCE(to_jsonb(objects)->>'owner_id', owner::text)));

-- Existing note provenance is not trusted merely because a caller authored it.
CREATE OR REPLACE FUNCTION public.can_access_note_row(target_note uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.proposition_notes n
    JOIN public.propositions p ON p.id = n.proposition_id AND p.organization_id = n.organization_id
    WHERE n.id = target_note AND public.can_access_proposition_row(p.id)
      AND (n.author_user_id = auth.uid() OR n.organization_id = auth.uid() OR public.is_platform_admin()));
$$;

CREATE OR REPLACE FUNCTION public.guard_note_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'proposition_notes' THEN
    SELECT p.organization_id INTO parent_org FROM public.propositions p WHERE p.id = NEW.proposition_id;
  ELSE
    SELECT n.organization_id INTO parent_org FROM public.proposition_notes n WHERE n.id = NEW.note_id;
  END IF;
  IF parent_org IS NULL OR parent_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Note parent organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id THEN
      RAISE EXCEPTION 'Note identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'proposition_notes' THEN
      IF NEW.proposition_id IS DISTINCT FROM OLD.proposition_id THEN
        RAISE EXCEPTION 'Note parent is immutable' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.note_id IS DISTINCT FROM OLD.note_id THEN
      RAISE EXCEPTION 'Entry parent is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_note_identity ON public.proposition_notes;
CREATE TRIGGER guard_note_identity BEFORE INSERT OR UPDATE ON public.proposition_notes
FOR EACH ROW EXECUTE FUNCTION public.guard_note_identity();
DROP TRIGGER IF EXISTS guard_note_identity ON public.proposition_note_entries;
CREATE TRIGGER guard_note_identity BEFORE INSERT OR UPDATE ON public.proposition_note_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_note_identity();

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('proposition_notes', 'proposition_note_entries') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
CREATE POLICY note_read ON public.proposition_notes FOR SELECT TO authenticated
USING ((author_user_id = auth.uid() OR organization_id = auth.uid() OR public.is_platform_admin())
  AND EXISTS (SELECT 1 FROM public.propositions p WHERE p.id = proposition_id
    AND p.organization_id = proposition_notes.organization_id AND public.can_access_proposition_row(p.id)));
CREATE POLICY note_insert ON public.proposition_notes FOR INSERT TO authenticated
WITH CHECK (author_user_id = auth.uid() AND public.can_access_proposition_row(proposition_id));
CREATE POLICY note_update ON public.proposition_notes FOR UPDATE TO authenticated
USING (public.can_access_note_row(id)) WITH CHECK (public.can_access_note_row(id));
CREATE POLICY note_delete ON public.proposition_notes FOR DELETE TO authenticated
USING (public.can_access_note_row(id));
CREATE POLICY note_entry_read ON public.proposition_note_entries FOR SELECT TO authenticated
USING (public.can_access_note_row(note_id));
CREATE POLICY note_entry_insert ON public.proposition_note_entries FOR INSERT TO authenticated
WITH CHECK (author_user_id = auth.uid() AND public.can_access_note_row(note_id));
CREATE POLICY note_entry_update ON public.proposition_note_entries FOR UPDATE TO authenticated
USING (public.can_access_note_row(note_id) AND (author_user_id = auth.uid() OR organization_id = auth.uid()))
WITH CHECK (public.can_access_note_row(note_id) AND (author_user_id = auth.uid() OR organization_id = auth.uid()));
CREATE POLICY note_entry_delete ON public.proposition_note_entries FOR DELETE TO authenticated
USING (public.can_access_note_row(note_id) AND (author_user_id = auth.uid() OR organization_id = auth.uid()));

-- Atomic, idempotent credit settlement. Credits never come from checkout metadata.
CREATE UNIQUE INDEX IF NOT EXISTS stripe_transactions_checkout_session_unique
ON public.stripe_transactions(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.settle_credit_checkout(
  p_session_id text, p_organization_id uuid, p_amount_cents bigint,
  p_customer_id text, p_payment_intent_id text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx public.stripe_transactions%ROWTYPE; org public.organizations%ROWTYPE;
  paid numeric; bonus_percent integer; credited numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 1000 OR p_amount_cents > 1000000
    OR NULLIF(p_session_id, '') IS NULL OR NULLIF(p_customer_id, '') IS NULL
    OR NULLIF(p_payment_intent_id, '') IS NULL THEN
    RAISE EXCEPTION 'Invalid checkout settlement';
  END IF;
  SELECT * INTO tx FROM public.stripe_transactions WHERE stripe_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout transaction missing'; END IF;
  paid := p_amount_cents::numeric / 100;
  IF tx.organization_id IS DISTINCT FROM p_organization_id OR tx.montant IS DISTINCT FROM paid THEN
    RAISE EXCEPTION 'Checkout transaction mismatch';
  END IF;
  IF tx.statut IN ('succeeded', 'refunded') THEN RETURN false; END IF;
  SELECT * INTO org FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR org.stripe_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Checkout customer mismatch';
  END IF;
  bonus_percent := CASE WHEN p_amount_cents >= 100000 THEN 20 WHEN p_amount_cents >= 50000 THEN 15
    WHEN p_amount_cents >= 25000 THEN 10 WHEN p_amount_cents >= 10000 THEN 5 ELSE 0 END;
  credited := paid + round(paid * bonus_percent / 100);
  UPDATE public.organizations SET credits = COALESCE(credits, 0) + credited, updated_at = now()
    WHERE id = p_organization_id;
  UPDATE public.stripe_transactions SET statut = 'succeeded', credits_ajoutes = credited,
    stripe_payment_intent_id = p_payment_intent_id WHERE id = tx.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_org_sector(uuid,text), public.can_access_proposition_sector(uuid,uuid),
  public.can_access_proposition_row(uuid), public.can_access_note_row(uuid), public.guard_note_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_org_sector(uuid,text), public.can_access_proposition_sector(uuid,uuid),
  public.can_access_proposition_row(uuid), public.can_access_note_row(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_credit_checkout(text,uuid,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_credit_checkout(text,uuid,bigint,text,text) TO service_role;
COMMIT;
