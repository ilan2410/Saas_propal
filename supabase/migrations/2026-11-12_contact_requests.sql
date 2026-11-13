-- Demandes de contact (formulaire « Être recontacté » de la page d'accueil).
-- Écriture uniquement via l'API serveur (service role). RLS activée SANS policy :
-- ni anon ni authenticated ne peuvent lire ou écrire directement cette table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (char_length(email) <= 254),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 30),
  company text NOT NULL CHECK (char_length(company) BETWEEN 2 AND 160),
  sector text NOT NULL CHECK (sector IN ('telephonie', 'bureautique', 'les_deux')),
  team_size text CHECK (team_size IN ('1-5', '6-20', '21-50', '50+')),
  message text CHECK (char_length(message) <= 500),
  consent_at timestamptz NOT NULL DEFAULT now(),
  confirmation_requested boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'traite')),
  handled_at timestamptz
);

CREATE INDEX IF NOT EXISTS contact_requests_created_at_idx
  ON public.contact_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_requests_status_idx
  ON public.contact_requests (status);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

COMMIT;
