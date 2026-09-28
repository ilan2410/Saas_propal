-- Métrage des coûts Claude par organisation (voir
-- docs/superpowers/specs/2026-09-28-metrage-couts-ia-stockage-design.md).
-- Une ligne par appel Claude d'extraction. Idempotent : sans risque à rejouer.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  proposition_id UUID REFERENCES public.propositions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operation TEXT NOT NULL
    CHECK (operation IN ('sa_analysis', 'sa_structuring', 'extraction', 'admin_test')),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_creation_input_tokens >= 0),
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_read_input_tokens >= 0),
  cost_usd NUMERIC(12, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un test d'extraction peut être lancé depuis la création d'une organisation,
  -- avant qu'elle existe : la dépense est réelle mais sans client à imputer.
  -- Toute autre opération est obligatoirement rattachée.
  CONSTRAINT ai_usage_events_org_required
    CHECK (operation = 'admin_test' OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created
  ON public.ai_usage_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_proposition
  ON public.ai_usage_events(proposition_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created
  ON public.ai_usage_events(created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Lecture réservée au super-admin : c'est la marge de la plateforme.
-- Aucune policy d'écriture : les insertions passent par le service client.
DROP POLICY IF EXISTS "Admins can view ai usage events" ON public.ai_usage_events;
CREATE POLICY "Admins can view ai usage events"
ON public.ai_usage_events FOR SELECT
USING ((auth.jwt() ->> 'role') = 'admin');

-- ==========================================
-- Volumétrie du stockage par organisation
-- ==========================================
-- storage.objects n'est pas exposé à l'API REST : cette fonction est le seul
-- accès. SECURITY DEFINER + EXECUTE réservé à service_role (l'appelant est déjà
-- authentifié comme admin côté Next.js).
CREATE OR REPLACE FUNCTION public.admin_storage_usage_by_org(
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (organization_id UUID, bucket_id TEXT, bytes BIGINT, objects BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
  WITH chemins AS (
    SELECT
      o.bucket_id,
      COALESCE((o.metadata ->> 'size')::BIGINT, 0) AS taille,
      -- Les fichiers générés vivent sous generated/<orgId>/, tout le reste
      -- sous <orgId>/.
      CASE
        WHEN o.path_tokens[1] = 'generated' THEN o.path_tokens[2]
        ELSE o.path_tokens[1]
      END AS org_texte
    FROM storage.objects o
  ),
  candidats AS (
    SELECT
      c.bucket_id,
      c.taille,
      -- Le CASE court-circuite VRAIMENT, contrairement aux quals d'une clause
      -- ON : placer le regex dans le JOIN laisserait Postgres évaluer le cast
      -- sur toutes les lignes (clé de hachage) et lever 22P02 sur le premier
      -- objet écrit à la racine d'un bucket — ce que font les générateurs
      -- historiques du bucket `propositions`. Toute la volumétrie tomberait
      -- alors en silence.
      CASE
        WHEN c.org_texte ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN c.org_texte::UUID
      END AS org_uuid
    FROM chemins c
  )
  SELECT
    org.id,
    c.bucket_id,
    SUM(c.taille)::BIGINT,
    COUNT(*)::BIGINT
  FROM candidats c
  LEFT JOIN public.organizations org ON org.id = c.org_uuid
  -- NULL = toutes les organisations, y compris la ligne "non attribué".
  WHERE p_organization_id IS NULL OR org.id = p_organization_id
  GROUP BY org.id, c.bucket_id;
$fn$;

REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_storage_usage_by_org(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_usage_by_org(UUID) TO service_role;

-- Taux de conversion USD -> EUR, utilisé uniquement à l'affichage.
INSERT INTO public.platform_settings (key, value)
VALUES ('usd_to_eur_rate', '0.92'::jsonb)
ON CONFLICT (key) DO NOTHING;
