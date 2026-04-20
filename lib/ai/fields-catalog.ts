/**
 * Catalogue des champs connus par secteur pour l'analyse IA.
 *
 * Ce module formate les champs définis dans
 * `components/admin/organizationFormConfig.ts` pour injection dans le
 * prompt Claude, afin que l'IA propose des `suggestedDataKey` cohérents
 * avec ce que le générateur attend (`lib/generators/index.ts`).
 *
 * Pour l'instant seul le secteur `telephonie` est supporté, mais la
 * structure permet d'ajouter `bureautique` facilement.
 */

import {
  TELEPHONIE_FIELDS,
  ARRAY_FIELDS,
  TELECOM_LINES_CATEGORIES,
} from '@/components/admin/organizationFormConfig';

export type Secteur = 'telephonie'; // TODO: 'bureautique'

export interface SimpleFieldCatalogEntry {
  key: string;          // ex: 'client.nom_entreprise'
  label: string;        // ex: 'Nom du client'
  category: string;     // ex: 'client'
}

export interface ArrayFieldCatalogEntry {
  id: string;           // ex: 'lignes_mobiles'
  label: string;
  type?: string;        // mobile | fixe | internet | ...
  columns: Array<{ id: string; label: string; key: string }>;
}

export interface FieldsCatalog {
  secteur: Secteur;
  simpleFields: SimpleFieldCatalogEntry[];
  arrayFields: ArrayFieldCatalogEntry[];
  mergeableGroups: Array<{ id: string; label: string; type: string }>;
}

/**
 * Construit le catalogue complet pour un secteur donné.
 */
export function buildFieldsCatalog(secteur: Secteur): FieldsCatalog {
  if (secteur !== 'telephonie') {
    throw new Error(`Secteur non supporté: ${secteur}`);
  }

  const simpleFields: SimpleFieldCatalogEntry[] = [];
  for (const [category, fields] of Object.entries(TELEPHONIE_FIELDS)) {
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (typeof field !== 'string') continue;
      // Ignorer les clés de tableaux (déjà exposées dans arrayFields)
      if (field.includes('[]')) continue;
      // Les clés de TELEPHONIE_FIELDS sont déjà préfixées (ex: 'client.nom')
      const key = field.includes('.') ? field : `${category}.${field}`;
      const shortLabel = key.split('.').pop() || key;
      simpleFields.push({
        key,
        label: shortLabel.replace(/_/g, ' '),
        category,
      });
    }
  }

  const arrayFields: ArrayFieldCatalogEntry[] = (ARRAY_FIELDS.telephonie || []).map(
    (af) => ({
      id: af.id,
      label: af.label,
      type: (af as { type?: string }).type,
      columns: (af.rowFields || []).map((c: { id: string; label: string }) => ({
        id: c.id,
        label: c.label,
        key: `${af.id}.${c.id}`,
      })),
    })
  );

  return {
    secteur,
    simpleFields,
    arrayFields,
    mergeableGroups: TELECOM_LINES_CATEGORIES,
  };
}

/**
 * Formate le catalogue en texte lisible pour Claude.
 */
export function formatCatalogForPrompt(catalog: FieldsCatalog): string {
  const simpleLines = catalog.simpleFields
    .map((f) => `  - ${f.key} (${f.label}) [catégorie: ${f.category}]`)
    .join('\n');

  const arrayLines = catalog.arrayFields
    .map((t) => {
      const cols = t.columns.map((c) => `      * ${c.key} : ${c.label}`).join('\n');
      return `  - ${t.id} (${t.label}${t.type ? `, type=${t.type}` : ''})\n${cols}`;
    })
    .join('\n');

  const mergeable = catalog.mergeableGroups
    .map((g) => `  - ${g.id} (${g.label}, type=${g.type})`)
    .join('\n');

  return `## CATALOGUE DES CHAMPS CONNUS (secteur: ${catalog.secteur})

### Variables simples disponibles
${simpleLines || '  (aucune)'}

### Tableaux disponibles
${arrayLines || '  (aucun)'}

### Groupes fusionnables (mêmes colonnes, peuvent être regroupés)
${mergeable || '  (aucun)'}
`;
}
