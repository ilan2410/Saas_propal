-- Signature électronique via DocuSeal (chaque organisation utilise son propre compte).
-- Tables serveur uniquement : RLS activée SANS policy, accès exclusif via les routes
-- API (service role) après contrôle d'organisation / permissions.
BEGIN;

-- Réglages de l'intégration par organisation. La clé API et le token de webhook
-- sont chiffrés (AES-256-GCM, INTEGRATION_SECRET_ENCRYPTION_KEY) ; le hash SHA-256
-- du token sert à retrouver l'organisation lors d'un appel webhook.
CREATE TABLE IF NOT EXISTS public.organization_docuseal_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  -- Cloud DocuSeal uniquement : Europe (docuseal.eu) ou US (docuseal.com).
  api_base_url text NOT NULL CHECK (api_base_url IN ('https://api.docuseal.eu', 'https://api.docuseal.com')),
  api_key_encrypted text NOT NULL,
  api_key_last4 text NOT NULL CHECK (char_length(api_key_last4) <= 4),
  webhook_token_encrypted text NOT NULL,
  webhook_token_hash text NOT NULL UNIQUE CHECK (webhook_token_hash ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Envois en signature d'une proposition (une ligne par soumission DocuSeal).
CREATE TABLE IF NOT EXISTS public.proposition_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  proposition_id uuid NOT NULL REFERENCES public.propositions(id) ON DELETE CASCADE,
  submission_id bigint,
  submitter_id bigint,
  document_name text NOT NULL CHECK (char_length(document_name) BETWEEN 1 AND 200),
  signer_name text NOT NULL CHECK (char_length(signer_name) BETWEEN 1 AND 160),
  signer_email text NOT NULL CHECK (char_length(signer_email) BETWEEN 3 AND 254),
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'opened', 'completed', 'declined', 'expired', 'cancelled', 'error')),
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  expire_at timestamptz,
  signed_document_path text,
  audit_log_path text,
  last_event_at timestamptz,
  error text CHECK (char_length(error) <= 1000)
);

CREATE INDEX IF NOT EXISTS proposition_signatures_proposition_idx
  ON public.proposition_signatures (proposition_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS proposition_signatures_submission_idx
  ON public.proposition_signatures (organization_id, submission_id)
  WHERE submission_id IS NOT NULL;
-- Un seul envoi en cours par proposition (évite les doubles envois concurrents).
CREATE UNIQUE INDEX IF NOT EXISTS proposition_signatures_one_active_idx
  ON public.proposition_signatures (proposition_id)
  WHERE status IN ('sending', 'sent', 'opened');

ALTER TABLE public.organization_docuseal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposition_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_docuseal_settings, public.proposition_signatures FROM anon, authenticated;
GRANT ALL ON public.organization_docuseal_settings, public.proposition_signatures TO service_role;

COMMIT;
