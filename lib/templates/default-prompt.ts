// Server-owned fallback for extraction templates.
export const DEFAULT_PROMPT = `Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, etc.).

Analyse le(s) document(s) fourni(s) et extrais les informations demandées au format JSON.

STRUCTURE JSON ATTENDUE:
{
  "resume": "Résumé en français (titres + listes) basé sur les informations trouvées",
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
- Le champ "resume" doit être un texte structuré et lisible, sans inventer d'informations

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;
