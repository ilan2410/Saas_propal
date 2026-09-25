function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Nom affiché pour une proposition dans les listes / en-têtes.
 *
 * Ordre de résolution :
 *  1. `fallbackNomClient` : la colonne propositions.nom_client saisie manuellement
 *  2. contact extrait  : client.nom / client.name, puis client.prenom + client.nom
 *  3. entreprise extraite : client.raison_sociale / societe / entreprise
 *     (ajouté pour les dossiers où seul le nom d'entreprise est extrait — ex.
 *     bureautique/copieurs — qui affichaient "Sans nom")
 *  4. clés à plat dans extracted_data (client.nom, raison_sociale, nom_client…)
 *  5. tout objet dont la clé contient "client"
 *  6. `placeholder`
 */
export function resolvePropositionClientName(
  extractedData: unknown,
  fallbackNomClient?: unknown,
  placeholder = 'Sans nom',
): string {
  const explicitName = firstString(fallbackNomClient);
  if (explicitName) return explicitName;
  try {
    const data: Record<string, unknown> = isRecord(extractedData) ? extractedData : {};
    const client = isRecord(data.client) ? data.client : null;

    if (client) {
      const nom = firstString(client.nom, client.name);
      if (nom) return nom;

      const prenom = firstString(client.prenom);
      const nomSeul = firstString(client.nom);
      if (prenom && nomSeul) return `${prenom} ${nomSeul}`;

      const societe = firstString(client.raison_sociale, client.societe, client.entreprise);
      if (societe) return societe;
    }

    const flat = firstString(
      data['client.nom'],
      data['client.raison_sociale'],
      data.raison_sociale,
      data.nom_client,
      data.client_nom,
    );
    if (flat) return flat;

    const flatPrenom = firstString(data['client.prenom']);
    const flatNom = firstString(data['client.nom']);
    if (flatPrenom && flatNom) return `${flatPrenom} ${flatNom}`;

    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('client') && isRecord(value)) {
        const nom = firstString(value.nom, value.name, value.raison_sociale);
        if (nom) return nom;
      }
    }

    return placeholder;
  } catch {
    return placeholder;
  }
}
