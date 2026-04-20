/**
 * Injection des `{{variables}}` dans un .docx à partir d'une AIAnalysis.
 *
 * Stratégie :
 *  - Variables simples
 *      - Si `detectedValue` est présent (template rempli)   -> remplace la valeur
 *      - Sinon (template vierge)                            -> injecte la variable
 *                                                             après le label détecté
 *  - Tableaux
 *      - Identifie le `<w:tbl>` cible par l'intersection des headers de colonnes
 *      - Entoure la ligne répétable (1ère ligne de données)
 *        avec {{#id_table}} … {{/id_table}}
 *      - Remplace le contenu des cellules par {{colonne}}
 *
 * Le XML est manipulé via pizzip. On évite tout `<w:t xml:space="preserve">`
 * qui casserait le rendu Word.
 */

import PizZip from 'pizzip';
import type { AIAnalysis, AISimpleVariable, AITable } from './template-analyzer';

// ---------- helpers XML ----------

function getWtText(node: string): string {
  // Extrait le contenu textuel d'un fragment <w:p>/<w:tc>/<w:tr>
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(node)) !== null) out += m[1];
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Remplace le texte d'un run en gardant le formatage.
 * On cible le premier <w:t> du paragraphe contenant `needle`.
 */
function replaceTextInXml(xml: string, needle: string, replacement: string): string {
  if (!needle) return xml;
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g);
  if (!paragraphs) return xml;
  for (const p of paragraphs) {
    if (getWtText(p).includes(needle)) {
      const replaced = p.replace(
        /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/,
        (_full, open, content) => `${open}${escapeXml(
          String(content).replace(needle, replacement)
        )}</w:t>`
      );
      return xml.replace(p, replaced);
    }
  }
  return xml;
}

/**
 * Ajoute `suffix` après la première occurrence de `label` dans un paragraphe.
 * Utilisé en mode "vierge" : on injecte la variable à côté du label détecté.
 */
function appendAfterLabel(xml: string, label: string, suffix: string): string {
  if (!label) return xml;
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g);
  if (!paragraphs) return xml;
  for (const p of paragraphs) {
    const text = getWtText(p);
    if (text.includes(label)) {
      // On remplace dans le PREMIER <w:t> contenant le label
      const replaced = p.replace(
        /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/,
        (full, open, content, close) => {
          const str = String(content);
          if (!str.includes(label)) return full;
          const newContent = str.replace(label, `${label} ${suffix}`);
          return `${open}${escapeXml(newContent)}${close}`;
        }
      );
      return xml.replace(p, replaced);
    }
  }
  // Fallback : ajouter un paragraphe n'est pas trivial -> no-op silencieux
  return xml;
}

// ---------- tableaux ----------

function findTableIndexByHeaders(xml: string, headers: string[]): number {
  if (headers.length === 0) return -1;
  const tables = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  let bestIdx = -1;
  let bestScore = 0;
  const lowered = headers.map((h) => h.toLowerCase());
  for (let i = 0; i < tables.length; i++) {
    const text = getWtText(tables[i]).toLowerCase();
    const score = lowered.reduce((s, h) => (h && text.includes(h) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore >= Math.max(1, Math.floor(headers.length / 2)) ? bestIdx : -1;
}

function transformTable(tableXml: string, table: AITable): string {
  const rows = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g);
  if (!rows || rows.length < 2) return tableXml;

  const headerRow = rows[0];
  const dataRow = rows[1];

  // Remplace le contenu de chaque cellule par {{colonne}}
  const cells = dataRow.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
  const newCells = cells.map((cell, idx) => {
    const col = table.columns.find((c) => c.columnIndex === idx) || table.columns[idx];
    if (!col) return cell;
    return cell.replace(
      /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/,
      `$1{{${col.id}}}$3`
    );
  });

  if (newCells.length === 0) return tableXml;

  // Injecte {{#id}} dans la première cellule et {{/id}} dans la dernière
  newCells[0] = newCells[0].replace(
    /(<w:t[^>]*>)/,
    `$1{{#${table.id}}}`
  );
  const lastIdx = newCells.length - 1;
  newCells[lastIdx] = newCells[lastIdx].replace(
    /(<\/w:t>)(?![\s\S]*<\/w:t>)/,
    `{{/${table.id}}}$1`
  );

  // Reconstruit la ligne en conservant ses attributs et <w:trPr>
  const newDataRow = dataRow.replace(
    /(<w:tc\b[\s\S]*<\/w:tc>)/,
    newCells.join('')
  );

  // Remplace dans le tableau le header + dataRow + (on retire les autres lignes
  // qui seront régénérées par docxtemplater)
  const allRowsXml = rows.join('');
  return tableXml.replace(allRowsXml, headerRow + newDataRow);
}

// ---------- entrée principale ----------

export async function injectVariablesIntoDocx(
  docxBuffer: Buffer,
  analysis: AIAnalysis
): Promise<Buffer> {
  const zip = new PizZip(docxBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('document.xml introuvable dans le .docx');

  let xml = documentFile.asText();

  // 1) Tableaux (on modifie en premier pour ne pas perturber la recherche de texte)
  const tables = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  const mutableTables = [...tables];

  for (const table of analysis.tables) {
    const headers = table.columns.map((c) => c.header).filter(Boolean);
    const idx = findTableIndexByHeaders(xml, headers);
    if (idx === -1) continue;
    const original = mutableTables[idx];
    if (!original) continue;
    const transformed = transformTable(original, table);
    xml = xml.replace(original, transformed);
    mutableTables[idx] = transformed;
  }

  // 2) Variables simples
  for (const v of analysis.simpleVariables) {
    xml = injectSimpleVariable(xml, v);
  }

  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer' });
}

function injectSimpleVariable(xml: string, v: AISimpleVariable): string {
  const placeholder = `{{${v.id}}}`;
  if (v.detectedValue && v.detectedValue.trim()) {
    // Template rempli : on remplace la valeur détectée
    return replaceTextInXml(xml, v.detectedValue, placeholder);
  }
  // Template vierge : on injecte derrière le label
  return appendAfterLabel(xml, v.label, placeholder);
}

// ---------- construction file_config compatible generators/index.ts ----------

export interface FileConfigAI {
  formatVariables: string;
  fieldMappings: Record<string, string>;
  custom_fields: Array<{ id: string; label: string; category?: string }>;
  custom_array_fields: Array<{
    id: string;
    label: string;
    rowFields: Array<{ id: string; label: string; type: 'string' | 'number' | 'date' }>;
  }>;
  ai?: true;
}

export function buildFileConfigFromAnalysis(
  analysis: AIAnalysis
): { fileConfig: FileConfigAI; champsActifs: string[] } {
  const fieldMappings: Record<string, string> = {};
  const custom_fields: FileConfigAI['custom_fields'] = [];
  const custom_array_fields: FileConfigAI['custom_array_fields'] = [];
  const champsActifs = new Set<string>();

  for (const v of analysis.simpleVariables) {
    fieldMappings[`{{${v.id}}}`] = v.suggestedDataKey;
    champsActifs.add(v.suggestedDataKey);
    if (v.isCustom) {
      custom_fields.push({ id: v.id, label: v.label, category: v.category });
    }
  }

  for (const t of analysis.tables) {
    for (const col of t.columns) {
      fieldMappings[`{{${t.id}.${col.id}}}`] = col.suggestedDataKey;
      champsActifs.add(col.suggestedDataKey);
    }
    const isCustom = !t.columns.every((c) =>
      c.suggestedDataKey.startsWith(`${t.id}.`)
    );
    if (isCustom) {
      custom_array_fields.push({
        id: t.id,
        label: t.label,
        rowFields: t.columns.map((c) => ({
          id: c.id,
          label: c.header,
          type: 'string',
        })),
      });
    }
  }

  return {
    fileConfig: {
      formatVariables: '{{var}}',
      fieldMappings,
      custom_fields,
      custom_array_fields,
      ai: true,
    },
    champsActifs: Array.from(champsActifs),
  };
}
