-- SP alternatives share the immutable SA and documents of one parent proposition.
CREATE TABLE public.proposition_sp_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposition_id uuid NOT NULL REFERENCES public.propositions(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 nom text NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 80),
 suggestions_sp_completes jsonb,
 sp_reponses jsonb NOT NULL DEFAULT '[]',
 filled_data jsonb NOT NULL DEFAULT '{}',
 selected_sub_template_ids uuid[],
 duplicated_template_url text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.proposition_sp_variants(proposition_id, organization_id);
ALTER TABLE public.proposition_sp_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposition_sp_variants FROM anon, authenticated;
GRANT ALL ON public.proposition_sp_variants TO service_role;

CREATE TABLE public.proposition_sp_variant_results (
 variant_id uuid NOT NULL REFERENCES public.proposition_sp_variants(id) ON DELETE CASCADE,
 sub_template_id uuid NOT NULL REFERENCES public.template_sub_templates(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 file_url text,
 status text NOT NULL CHECK (status IN ('success','error')),
 error text,
 generated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (variant_id, sub_template_id)
);
ALTER TABLE public.proposition_sp_variant_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proposition_sp_variant_results FROM anon, authenticated;
GRANT ALL ON public.proposition_sp_variant_results TO service_role;

-- Protect generated variant files from orphan cleanup.
CREATE OR REPLACE FUNCTION public.admin_storage_classify(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  bucket_id TEXT,
  name TEXT,
  categorie TEXT,
  bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  WITH candidats AS (
    SELECT
      o.bucket_id,
      o.name,
      COALESCE((o.metadata ->> 'size')::BIGINT, 0) AS taille,
      (o.path_tokens[1] = 'generated') AS est_genere,
      public.storage_org_id(o.name) AS org_uuid
    FROM storage.objects o
  ),
  classes AS (
    SELECT
      c.bucket_id,
      c.name,
      c.taille,
      c.org_uuid,
      CASE
        -- Templates maîtres : référencés par proposition_templates.file_url.
        -- `file_url` est une URL publique ; le chemin de stockage est ce qui
        -- suit « /templates/ ». safeStorageFileName ne produit que [a-z0-9-],
        -- donc l'appariement est exact ; le replace couvre les fichiers anciens.
        WHEN c.bucket_id = 'templates' AND NOT COALESCE(c.est_genere, FALSE) THEN
          CASE
            WHEN c.org_uuid IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.proposition_templates t
              WHERE t.organization_id = c.org_uuid
                AND t.file_url IS NOT NULL
                AND replace(split_part(t.file_url, '/templates/', 2), '%20', ' ') = c.name
            ) OR EXISTS (
              SELECT 1 FROM public.template_sub_templates st
              WHERE st.organization_id = c.org_uuid
                AND replace(split_part(st.file_url, '/templates/', 2), '%20', ' ') = c.name
            ) THEN 'templates'
            ELSE 'orphelins'
          END

        -- Fichiers générés : référencés par une proposition. La colonne
        -- historique `fichier_genere_url` n'existe pas partout, d'où le passage
        -- par to_jsonb : une colonne absente ne fait pas échouer la fonction.
        WHEN c.bucket_id = 'templates' AND COALESCE(c.est_genere, FALSE) THEN
          CASE
            WHEN c.org_uuid IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.propositions p
              WHERE p.organization_id = c.org_uuid
                AND EXISTS (
                  SELECT 1 FROM jsonb_each_text(to_jsonb(p)) AS kv(cle, valeur)
                  WHERE kv.cle IN ('duplicated_template_url', 'fichier_genere_url')
                    AND kv.valeur LIKE '%/templates/%'
                    AND replace(split_part(kv.valeur, '/templates/', 2), '%20', ' ') = c.name
                )
            ) OR EXISTS (
              SELECT 1 FROM public.proposition_sub_template_results sr
              WHERE sr.organization_id = c.org_uuid
                AND replace(split_part(sr.file_url, '/templates/', 2), '%20', ' ') = c.name
            ) OR EXISTS (
              SELECT 1 FROM public.proposition_sp_variants v
              WHERE v.organization_id = c.org_uuid
                AND replace(split_part(v.duplicated_template_url, '/templates/', 2), '%20', ' ') = c.name
            ) OR EXISTS (
              SELECT 1 FROM public.proposition_sp_variant_results vr
              WHERE vr.organization_id = c.org_uuid
                AND replace(split_part(vr.file_url, '/templates/', 2), '%20', ' ') = c.name
            ) THEN 'propositions_generees'
            ELSE 'orphelins'
          END

        WHEN c.bucket_id IN ('documents', 'proposition-attachments') THEN 'pieces_jointes'
        WHEN c.bucket_id = 'logos' THEN 'logos'
        WHEN c.bucket_id = 'catalogue-images' THEN 'images_catalogue'
        ELSE 'autres'
      END AS categorie
    FROM candidats c
  )
  SELECT c.org_uuid, c.bucket_id, c.name, c.categorie, c.taille
  FROM classes c
  WHERE p_organization_id IS NULL OR c.org_uuid = p_organization_id;
$fn$;
