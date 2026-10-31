export const BUREAUTIQUE_DEFAULT_PROMPT = `Tu es un expert en analyse de contrats et factures de bureautique B2B (copieurs, imprimantes multifonctions, maintenance et facturation à la page).

Analyse tous les documents fournis. Extrais uniquement les informations vérifiables, en conservant le lien entre chaque matériel, son site, sa location, sa maintenance, ses compteurs et ses options. Un contrat peut couvrir plusieurs machines ; ne confonds pas le coût total du parc avec le tarif unitaire d'un copieur.

STRUCTURE JSON ATTENDUE:
{
  "fournisseur": "Prestataire, distributeur ou constructeur actuel",
  "client": {
    "raison_sociale": "Entreprise cliente",
    "contact": {
      "nom": "Nom",
      "prenom": "Prénom",
      "fonction": "Fonction",
      "email": "email@exemple.com",
      "telephone": "01 XX XX XX XX",
      "mobile": "06 XX XX XX XX"
    },
    "adresse": "Adresse",
    "code_postal": "75001",
    "ville": "Paris",
    "siret": "SIRET ou SIREN indiqué",
    "ape": "Code APE",
    "capital": "Capital social",
    "forme_juridique": "SAS/SARL/etc.",
    "rcs": "RCS"
  },
  "materiels": [
    {"type": "copieur|imprimante|scanner|multifonction", "marque": "Marque", "modele": "Modèle", "format": "A3|A4|autre", "couleur": "couleur|noir et blanc", "quantite": 1, "numero_serie": "Numéro de série", "site": "Site"}
  ],
  "locations": [
    {"materiel": "Modèle ou numéro de série", "loyer_mensuel": 0, "duree_engagement_mois": 0, "date_debut": "JJ/MM/AAAA", "date_fin": "JJ/MM/AAAA", "valeur_residuelle": 0}
  ],
  "maintenance": [
    {"materiel": "Modèle ou numéro de série", "toner_inclus": true, "pieces_incluses": true, "main_oeuvre_incluse": true, "sla": "Délai d'intervention", "tarif_mensuel": 0}
  ],
  "facturation_clics": [
    {"materiel": "Modèle ou numéro de série", "volume_inclus_noir": 0, "volume_inclus_couleur": 0, "prix_clic_noir": 0, "prix_clic_couleur": 0, "depassement_noir": 0, "depassement_couleur": 0}
  ],
  "releves_compteurs": [
    {"materiel": "Modèle ou numéro de série", "date_releve": "JJ/MM/AAAA", "compteur_noir": 0, "compteur_couleur": 0}
  ],
  "options": [
    {"materiel": "Modèle ou numéro de série", "type": "Option", "description": "Description", "tarif_mensuel": 0}
  ],
  "engagements": [
    {"materiel": "Modèle ou numéro de série", "duree_mois": 0, "date_fin_engagement": "JJ/MM/AAAA", "reconduction_tacite": true, "preavis_resiliation": "Délai et unité"}
  ]
}

CHAMPS À EXTRAIRE:
{liste_champs_actifs}

RÈGLES:
- Réponds uniquement avec un objet JSON valide, sans markdown ni commentaire.
- Retourne seulement les champs demandés. Utilise null si une valeur n'est pas documentée et [] si aucun élément d'un tableau n'est trouvé ; n'invente ni machine ni tarif.
- Parcours toutes les pages et tous les documents. Distingue fournisseur, société cliente, loueur financier et mainteneur lorsqu'ils diffèrent.
- Identifie chaque matériel par son numéro de série si disponible, sinon par modèle et site. Ne duplique pas une machine parce qu'elle apparaît dans plusieurs factures ; conserve la quantité réelle.
- Sépare loyer, maintenance, options et coût par clic. Ne confonds pas volumes inclus, relevés cumulés et pages facturées hors forfait.
- Reprends les montants HT lorsqu'ils sont indiqués. Si seuls des montants TTC sont disponibles, utilise le taux de TVA indiqué, ou 20 % à défaut, pour convertir en HT. N'invente pas de montant si la base de calcul manque.
- Mensualise les loyers et maintenances explicitement trimestriels (division par 3), semestriels (par 6) ou annuels (par 12). Ne divise pas les prix unitaires par clic ni les relevés de compteurs.
- Les prix par clic sont unitaires en euros, pas des loyers mensuels ; conserve leurs décimales. Les valeurs de compteur sont des index cumulés, pas des volumes mensuels.
- Utilise de vrais booléens uniquement si l'inclusion ou la reconduction est explicitement indiquée ; sinon null. Conserve les dates au format JJ/MM/AAAA.
- Ne calcule pas de résiliation, d'économies ou de coût futur sans données suffisantes. Ne fabrique aucune information pour atteindre un nombre de copieurs déclaré ; laisse les emplacements sans données vides.

DOCUMENT(S):
{documents}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;
