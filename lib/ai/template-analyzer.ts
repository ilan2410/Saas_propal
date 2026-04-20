/**
 * Analyse IA d'un template Word.
 *
 * Pipeline :
 *   1. .docx -> PDF (libreoffice-convert)
 *   2. PDF  -> PNG page par page (pdf-to-img + sharp)
 *   3. Extraction texte par page (mammoth)
 *   4. Extraction XML des tableaux par page (pizzip)
 *   5. Envoi à Claude (vision + texte + xml)
 *   6. Parsing JSON structuré -> AIAnalysis
 *
 * Le modèle Claude utilisé suit cette priorité :
 *   organization.claude_model  >  DEFAULT_CLAUDE_MODEL
 * (c.f. `components/admin/organizationFormConfig.ts`)
 */

import Anthropic from '@anthropic-ai/sdk';
import libreConvert from 'libreoffice-convert';
import { pdf as pdfToImg } from 'pdf-to-img';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { promisify } from 'util';
import { DEFAULT_CLAUDE_MODEL } from '@/components/admin/organizationFormConfig';
import {
  buildFieldsCatalog,
  formatCatalogForPrompt,
  type Secteur,
} from './fields-catalog';

const convertAsync = promisify<Buffer, string, undefined, Buffer>(
  libreConvert.convert as unknown as (
    doc: Buffer,
    ext: string,
    filter: undefined,
    callback: (err: Error | null, data: Buffer) => void
  ) => void
);

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface AIVariablePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AISimpleVariable {
  id: string;
  label: string;
  suggestedDataKey: string;
  pageNumber: number;
  position: AIVariablePosition;
  detectedValue?: string;
  category: string;
  isCustom: boolean;
}

export interface AITableColumn {
  id: string;
  header: string;
  columnIndex: number;
  suggestedDataKey: string;
}

export interface AITable {
  id: string;
  label: string;
  pageNumber: number;
  position: AIVariablePosition;
  columns: AITableColumn[];
  rowsDetected: number;
  mergedWith?: string[];
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIAnalysis {
  selectedPages: number[];
  documentType: 'vierge' | 'rempli' | 'mixte';
  simpleVariables: AISimpleVariable[];
  tables: AITable[];
  chatHistory: AIChatMessage[];
  lastAnalyzedAt: string;
  pageImageUrls: string[];
}

// ------------------------------------------------------------------
// Rendering pipeline
// ------------------------------------------------------------------

/**
 * Convertit un .docx en PDF via LibreOffice.
 */
export async function renderDocxToPdf(buffer: Buffer): Promise<Buffer> {
  return convertAsync(buffer, '.pdf', undefined);
}

/**
 * Convertit un PDF en une liste de PNG (une par page).
 */
export async function renderPdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const images: Buffer[] = [];
  const doc = await pdfToImg(pdfBuffer, { scale: 2 });
  for await (const page of doc) {
    images.push(page);
  }
  return images;
}

// ------------------------------------------------------------------
// Extraction texte & tableaux
// ------------------------------------------------------------------

/**
 * Extrait le texte brut découpé par saut de page.
 * Mammoth ne préserve pas toujours les page breaks, on se base sur
 * l'élément `<w:br w:type="page"/>` dans le XML.
 */
export async function extractTextByPage(docxBuffer: Buffer): Promise<string[]> {
  // Texte complet via mammoth
  const { value: fullText } = await mammoth.extractRawText({ buffer: docxBuffer });

  // Découpage heuristique via form feed (\f) que mammoth insère pour certains breaks
  const parts = fullText.split(/\f/);
  if (parts.length > 1) return parts.map((p) => p.trim());

  // Fallback : tout sur une seule page
  return [fullText.trim()];
}

/**
 * Extrait les <w:tbl> du document.xml. Le découpage par page Word étant
 * purement visuel (géré par Word au rendu), on retourne ici tous les
 * tableaux avec leur index d'apparition dans le flux.
 */
export function extractTablesXml(docxBuffer: Buffer): string[] {
  try {
    const zip = new PizZip(docxBuffer);
    const doc = zip.file('word/document.xml');
    if (!doc) return [];
    const xml = doc.asText();
    const matches = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) || [];
    return matches;
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Prompt
// ------------------------------------------------------------------

function buildSystemPrompt(catalog: string): string {
  return `Tu es un expert en analyse de templates Word pour la génération automatique de propositions commerciales.

${catalog}

## TA MISSION
Analyser une page d'un document Word et détecter :
1. Les **variables simples** (texte court : nom, adresse, montant, date…)
2. Les **tableaux** répétables (liste de lignes avec même structure)
3. Proposer pour chaque élément un \`suggestedDataKey\` depuis le catalogue ci-dessus,
   ou un identifiant custom en \`snake_case\` si aucun ne correspond.

## DÉTECTION VIERGE vs REMPLI
- **Vierge** : labels + placeholders (ex: « Nom du client : ____ »).
  -> proposer des variables à insérer à côté/après le label.
- **Rempli** : vraies données (ex: « Nom du client : Dupont SARL »).
  -> proposer de REMPLACER la valeur par une variable.
- **Mixte** : les deux coexistent. Traiter chaque cas individuellement.

## RÈGLES
- IDs en snake_case, sans accents, sans espaces.
- Les variables d'un tableau ne sont PAS listées dans \`simpleVariables\` ;
  elles vont dans \`tables[].columns\`.
- \`isCustom = true\` si \`suggestedDataKey\` n'est pas dans le catalogue.
- \`position\` est exprimée en coordonnées RELATIVES (0..1) par rapport
  à l'image de la page (x,y,width,height).
- Si un élément est incertain, réduis sa taille plutôt que l'ignorer.

## FORMAT DE SORTIE
Tu DOIS répondre UNIQUEMENT avec un JSON valide :
\`\`\`json
{
  "documentType": "vierge" | "rempli" | "mixte",
  "simpleVariables": [
    {
      "id": "nom_client",
      "label": "Nom du client",
      "suggestedDataKey": "client.raison_sociale",
      "position": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.04 },
      "detectedValue": "Dupont SARL",
      "category": "client",
      "isCustom": false
    }
  ],
  "tables": [
    {
      "id": "lignes_mobiles",
      "label": "Lignes mobiles",
      "position": { "x": 0.08, "y": 0.5, "width": 0.84, "height": 0.3 },
      "columns": [
        { "id": "numero_ligne", "header": "Numéro", "columnIndex": 0, "suggestedDataKey": "lignes_mobiles.numero_ligne" }
      ],
      "rowsDetected": 3
    }
  ]
}
\`\`\`
Pas de texte avant ou après le JSON.`;
}

// ------------------------------------------------------------------
// Claude call
// ------------------------------------------------------------------

function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

export function resolveClaudeModel(orgClaudeModel?: string | null): string {
  return (orgClaudeModel && orgClaudeModel.trim()) || DEFAULT_CLAUDE_MODEL;
}

function safeParseJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Tentative de réparation minimale : retirer les virgules de trop
    try {
      const repaired = raw.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  }
}

interface ClaudePageResult {
  documentType?: 'vierge' | 'rempli' | 'mixte';
  simpleVariables?: Array<Omit<AISimpleVariable, 'pageNumber'>>;
  tables?: Array<Omit<AITable, 'pageNumber'>>;
}

/**
 * Analyse une seule page avec Claude.
 */
async function analyzePageWithClaude(params: {
  pageNumber: number;
  imageBase64: string;
  pageText: string;
  tablesXml: string[];
  secteur: Secteur;
  claudeModel: string;
  catalogText: string;
}): Promise<{ result: ClaudePageResult; usage: { input: number; output: number } }> {
  const { imageBase64, pageText, tablesXml, claudeModel, catalogText, pageNumber } = params;
  const anthropic = getAnthropic();

  const userText = `PAGE ${pageNumber}

Texte extrait de la page :
"""
${pageText.slice(0, 6000)}
"""

XML des tableaux détectés (${tablesXml.length}) :
"""
${tablesXml.join('\n---\n').slice(0, 10000)}
"""

Analyse cette page en suivant tes instructions et retourne le JSON.`;

  const message = await anthropic.messages.create({
    model: claudeModel,
    max_tokens: 4096,
    system: buildSystemPrompt(catalogText),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64,
            },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const responseText =
    message.content[0]?.type === 'text' ? message.content[0].text : '';
  const parsed = safeParseJson<ClaudePageResult>(responseText) || {};

  return {
    result: parsed,
    usage: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    },
  };
}

/**
 * Lance l'analyse complète sur les pages sélectionnées.
 */
export async function analyzeWithClaude(params: {
  pages: Array<{
    pageNumber: number;
    imageBase64: string;
    text: string;
  }>;
  tablesXml: string[];
  secteur: Secteur;
  claudeModel: string;
  pageImageUrls: string[];
  selectedPages: number[];
}): Promise<AIAnalysis> {
  const { pages, tablesXml, secteur, claudeModel, pageImageUrls, selectedPages } =
    params;

  const catalog = buildFieldsCatalog(secteur);
  const catalogText = formatCatalogForPrompt(catalog);

  const simpleVariables: AISimpleVariable[] = [];
  const tables: AITable[] = [];
  const documentTypes: Array<'vierge' | 'rempli' | 'mixte'> = [];

  for (const page of pages) {
    try {
      const { result } = await analyzePageWithClaude({
        pageNumber: page.pageNumber,
        imageBase64: page.imageBase64,
        pageText: page.text,
        tablesXml,
        secteur,
        claudeModel,
        catalogText,
      });

      if (result.documentType) documentTypes.push(result.documentType);

      for (const v of result.simpleVariables || []) {
        simpleVariables.push({ ...v, pageNumber: page.pageNumber });
      }
      for (const t of result.tables || []) {
        tables.push({ ...t, pageNumber: page.pageNumber });
      }
    } catch (err) {
      console.error(`[AI] Échec analyse page ${page.pageNumber}:`, err);
    }
  }

  let documentType: 'vierge' | 'rempli' | 'mixte' = 'vierge';
  if (documentTypes.includes('mixte')) documentType = 'mixte';
  else if (documentTypes.includes('rempli') && documentTypes.includes('vierge'))
    documentType = 'mixte';
  else if (documentTypes.includes('rempli')) documentType = 'rempli';

  return {
    selectedPages,
    documentType,
    simpleVariables,
    tables,
    chatHistory: [],
    lastAnalyzedAt: new Date().toISOString(),
    pageImageUrls,
  };
}

// ------------------------------------------------------------------
// Chat refine
// ------------------------------------------------------------------

interface ChatPatch {
  response: string;
  actions?: Array<
    | { type: 'add_variable'; variable: AISimpleVariable }
    | { type: 'remove_variable'; id: string }
    | { type: 'rename_variable'; id: string; newId?: string; newLabel?: string; newKey?: string }
    | { type: 'merge_tables'; sourceIds: string[]; targetId: string }
    | { type: 'remove_table'; id: string }
  >;
}

/**
 * Affine l'analyse IA suite à un message utilisateur.
 */
export async function chatRefineAnalysis(params: {
  message: string;
  analysis: AIAnalysis;
  history: AIChatMessage[];
  claudeModel: string;
  secteur: Secteur;
}): Promise<{ response: string; updatedAnalysis: AIAnalysis }> {
  const { message, analysis, history, claudeModel, secteur } = params;
  const anthropic = getAnthropic();
  const catalog = buildFieldsCatalog(secteur);
  const catalogText = formatCatalogForPrompt(catalog);

  const systemPrompt = `Tu aides l'utilisateur à raffiner une analyse IA d'un template Word.

${catalogText}

État actuel de l'analyse (JSON) :
\`\`\`json
${JSON.stringify({ simpleVariables: analysis.simpleVariables, tables: analysis.tables }, null, 2)}
\`\`\`

Réponds avec un JSON :
\`\`\`json
{
  "response": "message court pour l'utilisateur",
  "actions": [ { "type": "...", ... } ]
}
\`\`\`
Actions disponibles :
- add_variable, remove_variable, rename_variable, merge_tables, remove_table.
Pas de texte hors du JSON.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const resp = await anthropic.messages.create({
    model: claudeModel,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
  const patch = safeParseJson<ChatPatch>(text) || { response: text };

  const updated: AIAnalysis = {
    ...analysis,
    simpleVariables: [...analysis.simpleVariables],
    tables: [...analysis.tables],
  };

  for (const action of patch.actions || []) {
    if (action.type === 'add_variable') {
      updated.simpleVariables.push(action.variable);
    } else if (action.type === 'remove_variable') {
      updated.simpleVariables = updated.simpleVariables.filter((v) => v.id !== action.id);
    } else if (action.type === 'rename_variable') {
      updated.simpleVariables = updated.simpleVariables.map((v) =>
        v.id === action.id
          ? {
              ...v,
              id: action.newId || v.id,
              label: action.newLabel || v.label,
              suggestedDataKey: action.newKey || v.suggestedDataKey,
            }
          : v
      );
    } else if (action.type === 'remove_table') {
      updated.tables = updated.tables.filter((t) => t.id !== action.id);
    } else if (action.type === 'merge_tables') {
      const target = updated.tables.find((t) => t.id === action.targetId);
      if (target) {
        target.mergedWith = [...(target.mergedWith || []), ...action.sourceIds];
        updated.tables = updated.tables.filter(
          (t) => t.id === action.targetId || !action.sourceIds.includes(t.id)
        );
      }
    }
  }

  updated.chatHistory = [
    ...history,
    { role: 'user', content: message, timestamp: new Date().toISOString() },
    { role: 'assistant', content: patch.response, timestamp: new Date().toISOString() },
  ];

  return { response: patch.response, updatedAnalysis: updated };
}
