UPDATE prompt_defaults
SET prompt_template = $prompt$Tu es un expert en analyse de documents commerciaux (factures téléphonie, contrats, échéanciers, leasers, locations et abonnements).

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
  "situation_actuelle": {
    "documents": [
      {"type_document": "facture|echeancier|contrat|autre", "numero_document": "...", "date_document": "JJ/MM/AAAA", "periode_facturation": {"date_debut": "JJ/MM/AAAA", "date_fin": "JJ/MM/AAAA"}}
    ],
    "operateurs": [{"nom": "Nom opérateur", "type": "operateur_telecom"}],
    "leasers": [{"nom": "Nom leaser", "type": "organisme_financement"}],
    "sites": [{"nom": "Site principal", "adresse": "Adresse complète", "code_postal": "75001", "ville": "Paris"}],
    "abonnements": [{"libelle": "Abonnement", "operateur": "Nom opérateur", "site": "Site concerné", "quantite": "1", "tarif_brut_mensuel": "XX.XX", "remise_mensuelle": "XX.XX", "tarif_net_mensuel": "XX.XX", "periode_facturation": "mensuelle|trimestrielle|annuelle|autre"}],
    "locations": [{"libelle": "Location matériel", "leaser": "Nom leaser", "site": "Site concerné", "materiel": "Description", "quantite": "1", "loyer_brut_mensuel": "XX.XX", "remise_mensuelle": "XX.XX", "loyer_net_mensuel": "XX.XX"}],
    "lignes": [{"numero_ligne": "0XXXXXXXXX", "type": "fixe|mobile|internet", "forfait": "Nom forfait", "operateur": "Nom opérateur", "site": "Site concerné", "tarif_brut_mensuel": "XX.XX", "remise_mensuelle": "XX.XX", "tarif_net_mensuel": "XX.XX", "date_fin_engagement_source": "JJ/MM/AAAA", "date_limite_resiliation_calculee": "JJ/MM/AAAA"}],
    "periodes_facturation": [{"date_debut": "JJ/MM/AAAA", "date_fin": "JJ/MM/AAAA", "periodicite": "mensuelle|trimestrielle|annuelle|autre"}],
    "engagements": [{"libelle": "Contrat/ligne/service", "date_fin_engagement_source": "JJ/MM/AAAA", "date_limite_resiliation_calculee": "JJ/MM/AAAA", "preavis_mois": 3}],
    "totaux": {"total_abonnements_source": "XX.XX", "total_abonnements_calcule": "XX.XX", "total_locations_source": "XX.XX", "total_locations_calcule": "XX.XX", "total_solution_actuelle_source": "XX.XX", "total_solution_actuelle_calcule": "XX.XX", "devise": "EUR", "precision": "HT|TTC|non_precise"},
    "indemnites": {"montant_source": "XX.XX", "montant_calcule": "XX.XX", "methode_calcul": "..."},
    "ligne_bon_commande_materiel": {"libelle": "Remboursement de XX.XX € au titre du solde définitif de vos contrats téléphoniques.", "montant": "XX.XX"}
  }
}

CHAMPS À EXTRAIRE:
{liste_champs_actifs}

RÈGLES:
- Retourne UNIQUEMENT un JSON valide
- Utilise null pour les informations absentes
- Les tarifs et montants sont des nombres quand ils sont certains
- Les tableaux peuvent contenir plusieurs éléments
- Extrais TOUTES les lignes trouvées dans le document
- Si "situation_actuelle" est demandée, sépare strictement opérateur télécom et leaser/organisme de financement.
- Si "situation_actuelle" est demandée, traite chaque facture, échéancier ou contrat comme un document distinct dans situation_actuelle.documents.
- Si "situation_actuelle" est demandée, conserve les montants lus dans les champs *_source et ajoute les montants calculés dans les champs *_calcule.
- Si "situation_actuelle" est demandée, sépare toujours tarif/loyer brut, remise et tarif/loyer net lorsque l'information existe.
- Si "situation_actuelle" est demandée, détecte les sites multiples et rattache les lignes, abonnements et locations à leur site si possible.
- Si "situation_actuelle" est demandée, pour chaque date de fin d'engagement, conserve la date trouvée dans date_fin_engagement_source et calcule date_limite_resiliation_calculee en retirant 3 mois.
- Si "situation_actuelle" est demandée, calcule total_abonnements_calcule, total_locations_calcule et total_solution_actuelle_calcule sans écraser les totaux source.
- Si "situation_actuelle" est demandée, extrait ou estime les indemnités dans indemnites.montant_source et indemnites.montant_calcule, puis prépare ligne_bon_commande_materiel.

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.$prompt$,
updated_at = NOW()
WHERE secteur IN ('telephonie', 'mixte');
