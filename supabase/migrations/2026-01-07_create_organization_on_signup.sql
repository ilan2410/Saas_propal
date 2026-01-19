-- Création automatique de l'organization lors de la création d'un user Auth
-- Permet une inscription self-serve sans ouvrir l'INSERT RLS sur organizations

CREATE OR REPLACE FUNCTION public.handle_new_user_create_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_name text;
  user_role text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'client');

  -- Ne rien faire pour les admins
  IF user_role = 'admin' THEN
    RETURN NEW;
  END IF;

  org_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'organization_name', ''), NEW.email);

  INSERT INTO public.organizations (
    id,
    nom,
    email,
    secteur,
    claude_model,
    prompt_template,
    champs_defaut,
    tarif_par_proposition,
    credits
  )
  VALUES (
    NEW.id,
    org_name,
    NEW.email,
    NULL,
    'claude-sonnet-4-5-20250929',
    $prompt$Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

Analyse le(s) document(s) fourni(s) et extrais les informations demandées au format JSON.

STRUCTURE JSON ATTENDUE:
{
  "fournisseur": "Nom du fournisseur/distributeur actuel",
  "client": {
    "nom": "Nom du contact",
    "prenom": "Prénom",
    "email": "email@exemple.com",
    "fonction": "Fonction",
    "mobile": "06 XX XX XX XX",
    "fixe": "01 XX XX XX XX",
    "raison_sociale": "Nom de l'entreprise",
    "adresse": "Adresse complète",
    "code_postal": "75001",
    "ville": "Paris",
    "siret": "XXXXXXXXXXXXX",
    "ape": "Code APE",
    "capital": "Capital social",
    "forme_juridique": "SAS/SARL/etc",
    "rcs": "RCS"
  },
  "lignes": [
    {"numero_ligne": "0XXXXXXXXX", "type": "mobile|fixe|internet", "forfait": "Nom forfait", "quantite": "1", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ],
  "location_materiel": [
    {"type": "Location", "quantite": "1", "materiel": "Description", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ]
}

CHAMPS À EXTRAIRE:
{liste_champs_actifs}

RÈGLES:
- Retourne UNIQUEMENT un JSON valide
- Utilise null pour les informations absentes
- Les tarifs sont des nombres (29.99 et non "29,99€")
- Les tableaux peuvent contenir plusieurs éléments
- Extrais TOUTES les lignes trouvées dans le document

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.$prompt$,
    '[]'::jsonb,
    5.00,
    0.00
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_create_organization ON auth.users;
CREATE TRIGGER on_auth_user_created_create_organization
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_create_organization();
