-- Archive légère des propositions (pour conserver l'historique malgré la limite à 15)

CREATE TABLE IF NOT EXISTS public.propositions_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  proposition_id UUID NOT NULL,
  template_id UUID,
  template_nom TEXT,
  template_type VARCHAR(20) CHECK (template_type IN ('excel', 'word', 'pdf')),
  nom_client TEXT,
  created_at TIMESTAMP,
  exported_at TIMESTAMP,
  source_documents JSONB,
  generated_file_name TEXT,
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_propositions_archive_proposition_id
ON public.propositions_archive (proposition_id);

CREATE INDEX IF NOT EXISTS idx_propositions_archive_org_created
ON public.propositions_archive (organization_id, created_at DESC);

ALTER TABLE public.propositions_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own propositions archive" ON public.propositions_archive;
CREATE POLICY "Users can view their own propositions archive"
ON public.propositions_archive FOR SELECT
USING (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);

DROP POLICY IF EXISTS "Service role can manage propositions archive" ON public.propositions_archive;
CREATE POLICY "Service role can manage propositions archive"
ON public.propositions_archive FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
