export type UnknownRecord = Record<string, unknown>;

export function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Récupère une valeur imbriquée avec un chemin en notation pointée
 * Ex: getNestedValue(obj, 'client.adresse.ville')
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Gérer les index de tableau (ex: "contacts.0.nom")
    if (/^\d+$/.test(part)) {
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(part, 10)];
    } else {
      if (!isPlainObject(current)) return undefined;
      current = current[part];
    }
  }

  return current;
}

export function setNestedValue(obj: UnknownRecord, path: string, value: unknown) {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;

  let current: UnknownRecord = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = current[key];
    if (isPlainObject(next)) {
      current = next;
      continue;
    }
    const created: UnknownRecord = {};
    current[key] = created;
    current = created;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Cherche une valeur dans un objet imbriqué en utilisant différentes stratégies
 * Ex: "contact_nom" peut correspondre à donnees.client.contacts[0].nom ou donnees.contact_nom
 */
export function findValueInData(donnees: UnknownRecord, fieldName: string): unknown {
  // 1. Chercher directement à la racine
  if (donnees[fieldName] !== undefined && donnees[fieldName] !== null) {
    return donnees[fieldName];
  }

  // 2. Chercher avec le chemin tel quel (notation pointée)
  const directPathValue = getNestedValue(donnees, fieldName);
  if (directPathValue !== undefined && directPathValue !== null) {
    return directPathValue;
  }

  // 3. Fallback: underscore -> dot (ex: contact_nom -> client.nom)
  const dotNotation = fieldName.replace(/_/g, '.');
  if (dotNotation !== fieldName) {
    const dotValue = getNestedValue(donnees, dotNotation);
    if (dotValue !== undefined && dotValue !== null) {
      return dotValue;
    }
  }

  // 4. Mapping spécifique pour les champs courants (ordre de priorité important)
  const fieldMappings: Record<string, string[]> = {
    'nom': ['client.nom'],
    'prenom': ['client.prenom'],
    'email': ['client.email'],
    'fonction': ['client.fonction'],
    'mobile': ['client.mobile', 'client.telephone'],
    'fixe': ['client.fixe'],
    'telephone': ['client.telephone', 'client.mobile', 'client.fixe'],

    // Contact client (PAS le fournisseur!)
    'contact_nom': ['client.nom', 'client.contact.nom', 'client.contacts.0.nom'],
    'contact_prenom': ['client.prenom', 'client.contact.prenom', 'client.contacts.0.prenom'],
    'contact_email': ['client.email', 'client.contact.email', 'client.contacts.0.email'],
    'contact_telephone': ['client.telephone', 'client.contact.telephone', 'client.contacts.0.telephone'],
    'contact_mobile': ['client.mobile', 'client.contact.mobile', 'client.contacts.0.mobile', 'client.telephone'],
    'contact_fixe': ['client.fixe', 'client.contact.fixe', 'client.contacts.0.fixe'],
    'contact_fonction': ['client.fonction', 'client.contact.fonction', 'client.contacts.0.fonction'],

    // Client
    'client_nom': ['client.raison_sociale', 'client.nom_commercial', 'client.nom'],
    'raison_sociale': ['client.raison_sociale'],
    'nom_commercial': ['client.nom_commercial'],
    'siren': ['client.siren'],
    'siret': ['client.siret'],
    'adresse': ['client.adresse', 'client.adresse.rue'],
    'adresse_complete': ['client.adresse', 'client.adresse.rue'],
    'code_postal': ['client.code_postal', 'client.adresse.code_postal'],
    'ville': ['client.ville', 'client.adresse.ville'],
    'pays': ['client.pays', 'client.adresse.pays'],
    'ape': ['client.ape'],
    'capital': ['client.capital'],
    'forme_juridique': ['client.forme_juridique'],
    'rcs': ['client.rcs'],

    // Fournisseur / Opérateur (séparé du contact!)
    'operateur_nom': ['fournisseur.nom', 'fournisseur'],
    'fournisseur_nom': ['fournisseur.nom', 'fournisseur'],
    'operateur_adresse': ['fournisseur.adresse'],
    'operateur_siret': ['fournisseur.siret'],
    'code_client': ['fournisseur.code_client'],
    'contact_support': ['fournisseur.contact_support'],

    // Facturation
    'total_ht': ['facturation.total_ht'],
    'total_ttc': ['facturation.total_ttc'],
    'total_tva': ['facturation.total_tva'],
    'numero_facture': ['facturation.numero_facture'],
    'date_facture': ['facturation.date_facture'],
    'date_echeance': ['facturation.date_echeance'],
    'periode_facturee': ['facturation.periode_facturee'],
    'mode_paiement': ['facturation.mode_paiement'],
    'iban': ['facturation.iban'],

    // Totaux par catégorie
    'abonnements_ht': ['facturation.abonnements_ht'],
    'services_ht': ['facturation.services_ht'],
    'reductions_ht': ['facturation.reductions_ht'],
    'consommations_ht': ['facturation.consommations_ht'],

    // Lignes
    'lignes_fixes': ['lignes.fixes'],
    'lignes_mobiles': ['lignes.mobiles'],
    'total_lignes_fixes': ['lignes.total_lignes_fixes'],
    'total_lignes_mobiles': ['lignes.total_lignes_mobiles'],
  };

  const paths = fieldMappings[fieldName];
  if (paths) {
    for (const path of paths) {
      const value = getNestedValue(donnees, path);
      // Vérifier que la valeur existe ET n'est pas un tableau vide
      if (value !== undefined && value !== null &&
          !(Array.isArray(value) && value.length === 0)) {
        return value;
      }
    }
  }

  // NE PAS faire de recherche récursive pour éviter les faux positifs
  // (ex: trouver "nom" du fournisseur au lieu du contact)

  return undefined;
}
