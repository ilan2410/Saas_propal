// Configuration partagée pour les formulaires de création et d'édition d'organisation
// Basée sur la structure JSON d'extraction

// ============================================
// QUESTIONS SIMPLES (Mode Simple)
// ============================================
export const SIMPLE_QUESTIONS = {
  telephonie: [
    {
      id: 'fournisseur',
      question: '📡 Fournisseur / Distributeur actuel',
      description: 'Nom du fournisseur ou distributeur téléphonique actuel',
      fields: ['fournisseur']
    },
    {
      id: 'client',
      question: '👤 Informations du client',
      description: 'Contact, entreprise, adresse, informations légales',
      fields: [
        'client.nom', 'client.prenom', 'client.email', 'client.fonction',
        'client.mobile', 'client.fixe', 'client.fax', 'client.raison_sociale',
        'client.adresse', 'client.code_postal', 'client.ville',
        'client.siret', 'client.ape', 'client.capital',
        'client.forme_juridique', 'client.rcs'
      ]
    },
    {
      id: 'lignes_mobiles',
      question: '📱 Lignes mobiles',
      description: 'Numéros, forfaits, tarifs et engagements mobiles',
      fields: [
        'lignes_mobiles[].numero_ligne', 'lignes_mobiles[].forfait',
        'lignes_mobiles[].quantite', 'lignes_mobiles[].tarif',
        'lignes_mobiles[].date_fin_engagement'
      ]
    },
    {
      id: 'lignes_fixes',
      question: '☎️ Lignes fixes',
      description: 'Numéros, forfaits, tarifs et engagements fixes',
      fields: [
        'lignes_fixes[].numero_ligne', 'lignes_fixes[].forfait',
        'lignes_fixes[].quantite', 'lignes_fixes[].tarif',
        'lignes_fixes[].date_fin_engagement'
      ]
    },
    {
      id: 'lignes_internet',
      question: '🌐 Lignes internet',
      description: 'Connexions internet, fibre, ADSL',
      fields: [
        'lignes_internet[].numero_ligne', 'lignes_internet[].forfait',
        'lignes_internet[].quantite', 'lignes_internet[].tarif',
        'lignes_internet[].date_fin_engagement'
      ]
    },
    {
      id: 'location_materiel',
      question: '🔧 Location de matériel',
      description: 'Équipements loués (standard, routeur, etc.)',
      fields: [
        'location_materiel[].type', 'location_materiel[].quantite',
        'location_materiel[].materiel', 'location_materiel[].tarif',
        'location_materiel[].date_fin_engagement'
      ]
    }
  ],
  bureautique: [
    {
      id: 'fournisseur',
      question: '🏢 Fournisseur bureautique',
      description: 'Nom du prestataire bureautique (revendeur/constructeur)',
      fields: ['fournisseur'],
    },
    {
      id: 'client',
      question: '👤 Informations client',
      description: "Entreprise + contact + informations légales",
      fields: [
        'client.raison_sociale',
        'client.contact.nom',
        'client.contact.prenom',
        'client.contact.fonction',
        'client.contact.email',
        'client.contact.telephone',
        'client.contact.mobile',
        'client.adresse',
        'client.code_postal',
        'client.ville',
        'client.siret',
        'client.ape',
        'client.capital',
        'client.forme_juridique',
        'client.rcs',
      ],
    },
    {
      id: 'materiels',
      question: '🖨️ Matériels',
      description: 'Copieurs, imprimantes, scanners (modèle, marque, options)',
      fields: [
        'materiels[].type',
        'materiels[].marque',
        'materiels[].modele',
        'materiels[].format',
        'materiels[].couleur',
        'materiels[].quantite',
        'materiels[].numero_serie',
        'materiels[].site',
      ],
    },
    {
      id: 'locations',
      question: '📄 Locations',
      description: 'Loyer mensuel, durée, dates, valeur résiduelle',
      fields: [
        'locations[].materiel',
        'locations[].loyer_mensuel',
        'locations[].duree_engagement_mois',
        'locations[].date_debut',
        'locations[].date_fin',
        'locations[].valeur_residuelle',
      ],
    },
    {
      id: 'maintenance',
      question: '🧰 Maintenance',
      description: 'Toner / pièces / main d’œuvre / SLA / tarif',
      fields: [
        'maintenance[].materiel',
        'maintenance[].toner_inclus',
        'maintenance[].pieces_incluses',
        'maintenance[].main_oeuvre_incluse',
        'maintenance[].sla',
        'maintenance[].tarif_mensuel',
      ],
    },
    {
      id: 'facturation_clics',
      question: '🧾 Facturation au clic',
      description: 'Volumes inclus, prix clic, dépassements (noir/couleur)',
      fields: [
        'facturation_clics[].materiel',
        'facturation_clics[].volume_inclus_noir',
        'facturation_clics[].volume_inclus_couleur',
        'facturation_clics[].prix_clic_noir',
        'facturation_clics[].prix_clic_couleur',
        'facturation_clics[].depassement_noir',
        'facturation_clics[].depassement_couleur',
      ],
    },
    {
      id: 'releves_compteurs',
      question: '📈 Relevés compteurs',
      description: 'Relevés et compteurs (noir/couleur)',
      fields: [
        'releves_compteurs[].materiel',
        'releves_compteurs[].date_releve',
        'releves_compteurs[].compteur_noir',
        'releves_compteurs[].compteur_couleur',
      ],
    },
    {
      id: 'options',
      question: '➕ Options',
      description: 'Finisher, agrafeuse, bacs, fax, etc.',
      fields: [
        'options[].materiel',
        'options[].type',
        'options[].description',
        'options[].tarif_mensuel',
      ],
    },
    {
      id: 'engagements',
      question: '⏳ Engagements',
      description: 'Durée, reconduction, préavis, dates',
      fields: [
        'engagements[].materiel',
        'engagements[].duree_mois',
        'engagements[].date_fin_engagement',
        'engagements[].reconduction_tacite',
        'engagements[].preavis_resiliation',
      ],
    },
  ],
  mixte: [
    {
      id: 'fournisseur',
      question: '📡 Fournisseur / Distributeur actuel',
      description: 'Nom du fournisseur ou distributeur actuel',
      fields: ['fournisseur']
    },
    {
      id: 'client',
      question: '👤 Informations du client',
      description: 'Contact, entreprise, adresse, informations légales',
      fields: [
        'client.nom', 'client.prenom', 'client.email', 'client.fonction',
        'client.mobile', 'client.fixe', 'client.fax', 'client.raison_sociale',
        'client.adresse', 'client.code_postal', 'client.ville',
        'client.siret', 'client.ape', 'client.capital',
        'client.forme_juridique', 'client.rcs'
      ]
    },
    {
      id: 'lignes_mobiles',
      question: '📱 Lignes mobiles',
      description: 'Numéros, forfaits, tarifs et engagements mobiles',
      fields: [
        'lignes_mobiles[].numero_ligne', 'lignes_mobiles[].forfait',
        'lignes_mobiles[].quantite', 'lignes_mobiles[].tarif',
        'lignes_mobiles[].date_fin_engagement'
      ]
    },
    {
      id: 'lignes_fixes',
      question: '☎️ Lignes fixes',
      description: 'Numéros, forfaits, tarifs et engagements fixes',
      fields: [
        'lignes_fixes[].numero_ligne', 'lignes_fixes[].forfait',
        'lignes_fixes[].quantite', 'lignes_fixes[].tarif',
        'lignes_fixes[].date_fin_engagement'
      ]
    },
    {
      id: 'lignes_internet',
      question: '🌐 Lignes internet',
      description: 'Connexions internet, fibre, ADSL',
      fields: [
        'lignes_internet[].numero_ligne', 'lignes_internet[].forfait',
        'lignes_internet[].quantite', 'lignes_internet[].tarif',
        'lignes_internet[].date_fin_engagement'
      ]
    },
    {
      id: 'location_materiel',
      question: '🔧 Location de matériel',
      description: 'Équipements loués (standard, routeur, copieurs, etc.)',
      fields: [
        'location_materiel[].type', 'location_materiel[].quantite',
        'location_materiel[].materiel', 'location_materiel[].tarif',
        'location_materiel[].date_fin_engagement'
      ]
    }
  ]
};

// ============================================
// CHAMPS POUR LE MODE AVANCÉ
// ============================================
export const TELEPHONIE_FIELDS = {
  // Fournisseur / Distributeur
  fournisseur: [
    'fournisseur',
  ],
  
  // Informations client
  client: [
    'client.nom',
    'client.prenom', 
    'client.email',
    'client.fonction',
    'client.mobile',
    'client.fixe',
    'client.fax',
    'client.raison_sociale',
    'client.adresse',
    'client.code_postal',
    'client.ville',
    'client.siret',
    'client.ape',
    'client.capital',
    'client.forme_juridique',
    'client.rcs',
  ],
  
  // Lignes mobiles (tableau)
  lignes_mobiles: [
    'lignes_mobiles[].numero_ligne',
    'lignes_mobiles[].forfait',
    'lignes_mobiles[].quantite',
    'lignes_mobiles[].tarif',
    'lignes_mobiles[].date_fin_engagement',
  ],
  
  // Lignes fixes (tableau)
  lignes_fixes: [
    'lignes_fixes[].numero_ligne',
    'lignes_fixes[].forfait',
    'lignes_fixes[].quantite',
    'lignes_fixes[].tarif',
    'lignes_fixes[].date_fin_engagement',
  ],
  
  // Lignes internet (tableau)
  lignes_internet: [
    'lignes_internet[].numero_ligne',
    'lignes_internet[].forfait',
    'lignes_internet[].quantite',
    'lignes_internet[].tarif',
    'lignes_internet[].date_fin_engagement',
  ],
  
  // Location matériel (tableau)
  location_materiel: [
    'location_materiel[].type',
    'location_materiel[].quantite',
    'location_materiel[].materiel',
    'location_materiel[].tarif',
    'location_materiel[].date_fin_engagement',
  ],
};

export const BUREAUTIQUE_FIELDS = {
  fournisseur: ['fournisseur'],

  client: [
    'client.raison_sociale',
    'client.contact.nom',
    'client.contact.prenom',
    'client.contact.fonction',
    'client.contact.email',
    'client.contact.telephone',
    'client.contact.mobile',
    'client.adresse',
    'client.code_postal',
    'client.ville',
    'client.siret',
    'client.ape',
    'client.capital',
    'client.forme_juridique',
    'client.rcs',
  ],

  materiels: [
    'materiels[].type',
    'materiels[].marque',
    'materiels[].modele',
    'materiels[].format',
    'materiels[].couleur',
    'materiels[].quantite',
    'materiels[].numero_serie',
    'materiels[].site',
  ],

  locations: [
    'locations[].materiel',
    'locations[].loyer_mensuel',
    'locations[].duree_engagement_mois',
    'locations[].date_debut',
    'locations[].date_fin',
    'locations[].valeur_residuelle',
  ],

  maintenance: [
    'maintenance[].materiel',
    'maintenance[].toner_inclus',
    'maintenance[].pieces_incluses',
    'maintenance[].main_oeuvre_incluse',
    'maintenance[].sla',
    'maintenance[].tarif_mensuel',
  ],

  facturation_clics: [
    'facturation_clics[].materiel',
    'facturation_clics[].volume_inclus_noir',
    'facturation_clics[].volume_inclus_couleur',
    'facturation_clics[].prix_clic_noir',
    'facturation_clics[].prix_clic_couleur',
    'facturation_clics[].depassement_noir',
    'facturation_clics[].depassement_couleur',
  ],

  releves_compteurs: [
    'releves_compteurs[].materiel',
    'releves_compteurs[].date_releve',
    'releves_compteurs[].compteur_noir',
    'releves_compteurs[].compteur_couleur',
  ],

  options: [
    'options[].materiel',
    'options[].type',
    'options[].description',
    'options[].tarif_mensuel',
  ],

  engagements: [
    'engagements[].materiel',
    'engagements[].duree_mois',
    'engagements[].date_fin_engagement',
    'engagements[].reconduction_tacite',
    'engagements[].preavis_resiliation',
  ],
};

// Alias historique (téléphonie) : conservé pour éviter les régressions
export const ALL_FIELDS = TELEPHONIE_FIELDS;

// LABELS DES CATÉGORIES
// ============================================
export const TELEPHONIE_CATEGORY_LABELS: Record<string, string> = {
  fournisseur: '📡 Fournisseur / Distributeur',
  client: '👤 Informations Client',
  lignes_mobiles: '📱 Lignes Mobiles',
  lignes_fixes: '📞 Lignes Fixes',
  lignes_internet: '🌐 Lignes Internet',
  location_materiel: '🔧 Location Matériel',
};

export const BUREAUTIQUE_CATEGORY_LABELS: Record<string, string> = {
  fournisseur: '🏢 Fournisseur',
  client: '👤 Client',
  materiels: '🖨️ Matériels',
  locations: '📄 Locations',
  maintenance: '🧰 Maintenance',
  facturation_clics: '🧾 Facturation clics',
  releves_compteurs: '📈 Relevés compteurs',
  options: '➕ Options',
  engagements: '⏳ Engagements',
};

// Alias historique (téléphonie) : conservé pour éviter les régressions
export const CATEGORY_LABELS: Record<string, string> = TELEPHONIE_CATEGORY_LABELS;

export const FIELDS_BY_SECTEUR = {
  telephonie: TELEPHONIE_FIELDS,
  bureautique: BUREAUTIQUE_FIELDS,
  mixte: TELEPHONIE_FIELDS,
};

export const CATEGORY_LABELS_BY_SECTEUR: Record<string, Record<string, string>> = {
  telephonie: TELEPHONIE_CATEGORY_LABELS,
  bureautique: BUREAUTIQUE_CATEGORY_LABELS,
  mixte: TELEPHONIE_CATEGORY_LABELS,
};

// ============================================
// CATÉGORIES FUSIONNABLES (tableaux uniquement)
// ============================================

// Groupe des lignes télécom (champs compatibles, fusionnables entre elles)
export const TELECOM_LINES_CATEGORIES = [
  { id: 'lignes_mobiles', label: '📱 Lignes Mobiles', type: 'mobile' },
  { id: 'lignes_fixes', label: '📞 Lignes Fixes', type: 'fixe' },
  { id: 'lignes_internet', label: '🌐 Lignes Internet', type: 'internet' },
];

// Catégories non fusionnables (champs différents)
export const NON_MERGEABLE_CATEGORIES = [
  { id: 'location_materiel', label: '🔧 Location Matériel', type: 'materiel' },
];

// Toutes les catégories tableau
export const ALL_ARRAY_CATEGORIES = [...TELECOM_LINES_CATEGORIES, ...NON_MERGEABLE_CATEGORIES];

// Fonction pour obtenir les catégories télécom sélectionnées (fusionnables)
export function getSelectedTelecomCategories(selectedQuestions: string[]): string[] {
  return TELECOM_LINES_CATEGORIES
    .filter(cat => selectedQuestions.includes(cat.id))
    .map(cat => cat.id);
}

// Fonction pour générer le label de fusion dynamique
export function getMergeLabel(categories: string[]): string {
  const labels = categories.map(cat => {
    const found = TELECOM_LINES_CATEGORIES.find(m => m.id === cat);
    return found?.label.replace(/^[^\s]+\s/, '') || cat; // Retirer l'emoji
  });
  return labels.join(' + ');
}

// Fonction pour générer le prompt adapté aux fusions dynamiques
export function generateMergedPrompt(
  basePrompt: string,
  mergedCategories: string[]  // Catégories à fusionner
): string {
  if (mergedCategories.length < 2) {
    return basePrompt;
  }

  // Déterminer les types pour chaque catégorie
  const types = mergedCategories.map(cat => {
    const found = TELECOM_LINES_CATEGORIES.find(m => m.id === cat);
    return found?.type || cat;
  });

  // Construire la structure JSON fusionnée
  const mergedStructure = `"lignes": [
    {"numero_ligne": "0XXXXXXXXX", "type": "${types.join('|')}", "forfait": "Nom forfait", "quantite": "1", "tarif": "XX.XX", "date_fin_engagement": "JJ/MM/AAAA"}
  ]`;

  let modifiedPrompt = basePrompt;

  // Remplacer chaque section individuelle par rien, puis ajouter la section fusionnée
  for (const cat of mergedCategories) {
    const regex = new RegExp(`"${cat}":\\s*\\[[^\\]]*\\],?\\s*`, 'g');
    modifiedPrompt = modifiedPrompt.replace(regex, '');
  }

  // Trouver où insérer la section fusionnée (après "client" ou avant "location_materiel")
  if (mergedCategories.includes('location_materiel')) {
    // Si location_materiel est fusionné, on remplace tout
    modifiedPrompt = modifiedPrompt.replace(
      /("client":\s*\{[^}]*\}),?\s*/,
      `$1,\n  ${mergedStructure},\n  `
    );
  } else {
    // Sinon on insère après client
    const beforeInsert = modifiedPrompt;
    modifiedPrompt = modifiedPrompt.replace(
      /("client":\s*\{[^}]*\}),?\s*("lignes_|"location_)/,
      `$1,\n  ${mergedStructure},\n  $2`
    );

    // Fallback : si on a supprimé toutes les sections "lignes_*" et qu'il n'y a pas de clé suivante attendue,
    // l'insertion ci-dessus ne matche pas. Dans ce cas, on insère quand même juste après "client".
    if (modifiedPrompt === beforeInsert) {
      modifiedPrompt = modifiedPrompt.replace(
        /("client":\s*\{[^}]*\}),?\s*/,
        `$1,\n  ${mergedStructure},\n  `
      );
    }
  }

  // Nettoyer les virgules en trop
  modifiedPrompt = modifiedPrompt.replace(/,(\s*[}\]])/g, '$1');
  modifiedPrompt = modifiedPrompt.replace(/,\s*,/g, ',');

  return modifiedPrompt;
}

// ============================================
// DÉFINITION DES CHAMPS TABLEAU (pour le mapping Excel)
// ============================================
export interface ArrayFieldDefinition {
  id: string;
  label: string;
  description: string;
  rowFields: {
    id: string;
    label: string;
    type: 'string' | 'number' | 'date';
  }[];
}

export const ARRAY_FIELDS: Record<string, ArrayFieldDefinition[]> = {
  telephonie: [
    {
      id: 'lignes_mobiles',
      label: '📱 Lignes mobiles',
      description: 'Liste des lignes mobiles avec forfaits et tarifs',
      rowFields: [
        { id: 'numero_ligne', label: 'Numéro', type: 'string' },
        { id: 'forfait', label: 'Forfait', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
    {
      id: 'lignes_fixes',
      label: '☎️ Lignes fixes',
      description: 'Liste des lignes fixes avec forfaits et tarifs',
      rowFields: [
        { id: 'numero_ligne', label: 'Numéro', type: 'string' },
        { id: 'forfait', label: 'Forfait', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
    {
      id: 'lignes_internet',
      label: '🌐 Lignes internet',
      description: 'Liste des connexions internet',
      rowFields: [
        { id: 'numero_ligne', label: 'Numéro', type: 'string' },
        { id: 'forfait', label: 'Forfait', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
    {
      id: 'location_materiel',
      label: '🔧 Location matériel',
      description: 'Liste des équipements loués',
      rowFields: [
        { id: 'type', label: 'Type', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
  ],
  bureautique: [
    {
      id: 'materiels',
      label: '🖨️ Matériels',
      description: 'Liste des matériels (copieurs/imprimantes/scanners)',
      rowFields: [
        { id: 'type', label: 'Type', type: 'string' },
        { id: 'marque', label: 'Marque', type: 'string' },
        { id: 'modele', label: 'Modèle', type: 'string' },
        { id: 'format', label: 'Format', type: 'string' },
        { id: 'couleur', label: 'Couleur', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'numero_serie', label: 'Numéro de série', type: 'string' },
        { id: 'site', label: 'Site', type: 'string' },
      ],
    },
    {
      id: 'locations',
      label: '📄 Locations',
      description: 'Loyers, durées, dates',
      rowFields: [
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'loyer_mensuel', label: 'Loyer mensuel', type: 'number' },
        { id: 'duree_engagement_mois', label: 'Durée (mois)', type: 'number' },
        { id: 'date_debut', label: 'Date début', type: 'date' },
        { id: 'date_fin', label: 'Date fin', type: 'date' },
        { id: 'valeur_residuelle', label: 'Valeur résiduelle', type: 'number' },
      ],
    },
    {
      id: 'maintenance',
      label: '🧰 Maintenance',
      description: 'Toner / pièces / main d’œuvre / SLA',
      rowFields: [
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'toner_inclus', label: 'Toner inclus', type: 'string' },
        { id: 'pieces_incluses', label: 'Pièces incluses', type: 'string' },
        { id: 'main_oeuvre_incluse', label: "Main d'œuvre incluse", type: 'string' },
        { id: 'sla', label: 'SLA', type: 'string' },
        { id: 'tarif_mensuel', label: 'Tarif mensuel', type: 'number' },
      ],
    },
    {
      id: 'facturation_clics',
      label: '🧾 Facturation clics',
      description: 'Volumes, prix, dépassements',
      rowFields: [
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'volume_inclus_noir', label: 'Volume inclus noir', type: 'number' },
        { id: 'volume_inclus_couleur', label: 'Volume inclus couleur', type: 'number' },
        { id: 'prix_clic_noir', label: 'Prix clic noir', type: 'number' },
        { id: 'prix_clic_couleur', label: 'Prix clic couleur', type: 'number' },
        { id: 'depassement_noir', label: 'Dépassement noir', type: 'number' },
        { id: 'depassement_couleur', label: 'Dépassement couleur', type: 'number' },
      ],
    },
    {
      id: 'releves_compteurs',
      label: '📈 Relevés compteurs',
      description: 'Date et compteurs',
      rowFields: [
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'date_releve', label: 'Date relevé', type: 'date' },
        { id: 'compteur_noir', label: 'Compteur noir', type: 'number' },
        { id: 'compteur_couleur', label: 'Compteur couleur', type: 'number' },
      ],
    },
    {
      id: 'options',
      label: '➕ Options',
      description: 'Options (finisher, agrafeuse, bacs, etc.)',
      rowFields: [
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'type', label: 'Type', type: 'string' },
        { id: 'description', label: 'Description', type: 'string' },
        { id: 'tarif_mensuel', label: 'Tarif mensuel', type: 'number' },
      ],
    },
    {
      id: 'engagements',
      label: '⏳ Engagements',
      description: 'Engagement, reconduction, préavis',
      rowFields: [
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'duree_mois', label: 'Durée (mois)', type: 'number' },
        { id: 'date_fin_engagement', label: 'Date fin engagement', type: 'date' },
        { id: 'reconduction_tacite', label: 'Reconduction tacite', type: 'string' },
        { id: 'preavis_resiliation', label: 'Préavis résiliation', type: 'string' },
      ],
    },
  ],
  mixte: [
    {
      id: 'lignes_mobiles',
      label: '📱 Lignes mobiles',
      description: 'Liste des lignes mobiles avec forfaits et tarifs',
      rowFields: [
        { id: 'numero_ligne', label: 'Numéro', type: 'string' },
        { id: 'forfait', label: 'Forfait', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
    {
      id: 'lignes_fixes',
      label: '☎️ Lignes fixes',
      description: 'Liste des lignes fixes avec forfaits et tarifs',
      rowFields: [
        { id: 'numero_ligne', label: 'Numéro', type: 'string' },
        { id: 'forfait', label: 'Forfait', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
    {
      id: 'lignes_internet',
      label: '🌐 Lignes internet',
      description: 'Liste des connexions internet',
      rowFields: [
        { id: 'numero_ligne', label: 'Numéro', type: 'string' },
        { id: 'forfait', label: 'Forfait', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
    {
      id: 'location_materiel',
      label: '🔧 Location matériel',
      description: 'Liste des équipements loués',
      rowFields: [
        { id: 'type', label: 'Type', type: 'string' },
        { id: 'quantite', label: 'Quantité', type: 'number' },
        { id: 'materiel', label: 'Matériel', type: 'string' },
        { id: 'tarif', label: 'Tarif', type: 'number' },
        { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
      ],
    },
  ],
};

// Fonction pour obtenir les champs array pour un secteur, avec gestion optionnelle de la fusion
export function getArrayFieldsForSecteur(secteur: string, mergedCategories: string[] = []): ArrayFieldDefinition[] {
  const baseArrays = ARRAY_FIELDS[secteur as keyof typeof ARRAY_FIELDS] || [];

  // Si pas de fusion valide (moins de 2 catégories), on retourne la base
  const validMerges = mergedCategories.filter(cat => 
    TELECOM_LINES_CATEGORIES.some(tc => tc.id === cat)
  );
  
  if (validMerges.length < 2) {
    return baseArrays;
  }

  // Créer le tableau fusionné
  const mergedArray: ArrayFieldDefinition = {
    id: 'lignes', // ID unifié dans le JSON final
    label: getMergeLabel(validMerges),
    description: 'Liste consolidée des lignes (fusion)',
    rowFields: [
      { id: 'numero_ligne', label: 'Numéro', type: 'string' },
      { id: 'type', label: 'Type', type: 'string' }, // Champ type ajouté
      { id: 'forfait', label: 'Forfait', type: 'string' },
      { id: 'quantite', label: 'Quantité', type: 'number' },
      { id: 'tarif', label: 'Tarif', type: 'number' },
      { id: 'date_fin_engagement', label: 'Fin engagement', type: 'date' },
    ],
  };

  // Filtrer les tableaux de base :
  // 1. Exclure ceux qui font partie de la fusion
  // 2. Garder ceux qui ne sont pas fusionnés (ex: location_materiel, ou lignes_internet si non fusionné)
  const remainingArrays = baseArrays.filter(arr => !validMerges.includes(arr.id));

  // Retourner [Tableau fusionné, ...Autres tableaux]
  // On met le tableau fusionné en premier
  return [mergedArray, ...remainingArrays];
}

// Secteurs disponibles
export const SECTEURS = [
  { value: 'telephonie', label: 'Téléphonie d\'entreprise' },
  { value: 'bureautique', label: 'Bureautique (copieurs/imprimantes)' },
  { value: 'mixte', label: 'Mixte (Téléphonie + Bureautique)' },
];

// Modèles Claude disponibles
export const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude 4.6 Sonnet (Recommandé)' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude 4.5 Sonnet' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
];

export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS[0]?.value || 'claude-sonnet-4-6';

// Types
export type Question = {
  id: string;
  question: string;
  description: string;
  fields: string[];
};

export type ViewMode = 'simple' | 'advanced';

// Fonctions utilitaires
export function getQuestionsForSecteur(secteur: string): Question[] {
  return SIMPLE_QUESTIONS[secteur as keyof typeof SIMPLE_QUESTIONS] || [];
}

export function getFieldsByCategoryForSecteur(secteur: string): Record<string, string[]> {
  return FIELDS_BY_SECTEUR[secteur as keyof typeof FIELDS_BY_SECTEUR] || TELEPHONIE_FIELDS;
}

export function getCategoryLabelForSecteur(secteur: string, key: string): string {
  const map = CATEGORY_LABELS_BY_SECTEUR[secteur] || TELEPHONIE_CATEGORY_LABELS;
  return map[key] || key;
}

export function getCategoryLabel(key: string): string {
  return CATEGORY_LABELS[key] || key;
}

export function getAllKnownFields(): string[] {
  const bySecteur = Object.values(FIELDS_BY_SECTEUR) as Array<Record<string, string[]>>;
  return bySecteur.flatMap((m) => Object.values(m).flat());
}

// Fonction pour synchroniser les modes Simple <-> Avancé
export function syncSimpleToAdvanced(
  selectedQuestions: string[],
  currentQuestions: Question[],
  existingSelectedFields: string[]
): string[] {
  // 1. Identifier tous les champs gérés par le mode simple actuel
  const allSimpleFields = currentQuestions.flatMap(q => q.fields);
  
  // 2. Identifier les champs des questions COCHÉES
  const fieldsFromQuestions = selectedQuestions.flatMap(qId => {
    const q = currentQuestions.find(question => question.id === qId);
    return q?.fields || [];
  });
  
  // 3. Conserver les champs qui étaient déjà sélectionnés mais qui NE SONT PAS dans le mode simple
  const preservedFields = existingSelectedFields.filter(f => !allSimpleFields.includes(f));
  
  // 4. Fusionner : champs conservés + champs des questions cochées
  return [...new Set([...preservedFields, ...fieldsFromQuestions])];
}

export function syncAdvancedToSimple(
  selectedFields: string[],
  currentQuestions: Question[]
): string[] {
  // On coche les questions dont TOUS les champs sont sélectionnés dans selectedFields
  return currentQuestions.filter(q => 
    q.fields.length > 0 && q.fields.every(f => selectedFields.includes(f))
  ).map(q => q.id);
}

// Fonction pour calculer le nombre de champs sélectionnés
export function getFieldsCount(
  viewMode: ViewMode,
  selectedQuestions: string[],
  currentQuestions: Question[],
  selectedFields: string[],
  customFields: string[]
): number {
  if (viewMode === 'simple') {
    const fromQuestions = selectedQuestions.flatMap(qId => {
      const q = currentQuestions.find(question => question.id === qId);
      return q?.fields || [];
    }).length;
    return fromQuestions + customFields.filter(f => f.trim()).length;
  }
  return selectedFields.length + customFields.filter(f => f.trim()).length;
}

// Fonction pour obtenir tous les champs sélectionnés (pour la soumission)
export function getAllSelectedFields(
  viewMode: ViewMode,
  selectedQuestions: string[],
  currentQuestions: Question[],
  selectedFields: string[],
  customFields: string[]
): string[] {
  if (viewMode === 'simple') {
    const fieldsFromQuestions = selectedQuestions.flatMap(questionId => {
      const question = currentQuestions.find(q => q.id === questionId);
      return question?.fields || [];
    });
    return [...fieldsFromQuestions, ...customFields.filter(f => f.trim())];
  }
  return [...selectedFields, ...customFields.filter(f => f.trim())];
}
