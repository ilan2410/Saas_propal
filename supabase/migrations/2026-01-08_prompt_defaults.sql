-- Table de prompts par défaut (globaux) par secteur
-- Utilisé lors de la création d'un nouveau template (client + admin)

CREATE TABLE IF NOT EXISTS prompt_defaults (
  secteur VARCHAR(100) PRIMARY KEY CHECK (secteur IN ('telephonie', 'bureautique', 'mixte')),
  prompt_template TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE prompt_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view prompt defaults"
ON prompt_defaults FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Seeds (si absent)
INSERT INTO prompt_defaults (secteur, prompt_template)
VALUES (
  'telephonie',
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

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.$prompt$
)
ON CONFLICT (secteur) DO NOTHING;

-- Pour l'instant, on met le même prompt (l'admin pourra les modifier plus tard)
INSERT INTO prompt_defaults (secteur, prompt_template)
SELECT 'bureautique', prompt_template
FROM prompt_defaults
WHERE secteur = 'telephonie'
ON CONFLICT (secteur) DO NOTHING;

INSERT INTO prompt_defaults (secteur, prompt_template)
SELECT 'mixte', prompt_template
FROM prompt_defaults
WHERE secteur = 'telephonie'
ON CONFLICT (secteur) DO NOTHING;
