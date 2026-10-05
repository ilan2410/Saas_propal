// Client Claude AI pour l'extraction de données
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { assertAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { buildClaudeEffortConfig, buildClaudeModelOptions, DEFAULT_CLAUDE_MODEL, getClaudeMaxOutputTokens, isDeepSeekSaModel, STRUCTURING_CLAUDE_EFFORT } from '@/lib/ai/claude-models';
import { callDeepSeekStructured, prepareDocumentsForDeepSeek } from '@/lib/ai/deepseek';
import { InvoiceAnalysisAiSchema, normalizeInvoiceAnalysisOutput, type InvoiceAnalysisReport, type CanonicalSaAnalysis } from '@/lib/sa/invoice-analysis';
import { StructuredSaAiSchema, normalizeStructuredSaOutput, type StructuredSa } from '@/lib/sa/structure-sa';

import type { ClaudeCallUsage } from '@/lib/ai/claude-pricing';
import { ClaudeCallError } from '@/lib/ai/claude-errors';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export type { ClaudeCallUsage };

/** Donnees d'un appel, accompagnees de sa consommation facturee. */
export type WithUsage<T> = { data: T; usage: ClaudeCallUsage };

/** Lit `message.usage` en traitant les compteurs de cache absents comme zero. */
function readUsage(
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  },
  model: string,
): ClaudeCallUsage {
  return {
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}

/**
 * Valide que la clé API Claude est configurée
 */
export function validateClaudeApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Échappe les caractères de contrôle bruts (retours à la ligne, tabulations, etc.)
 * trouvés à l'intérieur des chaînes JSON. Claude produit parfois des champs texte
 * multi-lignes (ex: "resume") avec de vrais sauts de ligne au lieu de `\n` échappé,
 * ce qui fait échouer `JSON.parse` avec "Bad control character in string literal".
 */
function sanitizeJsonControlCharacters(jsonStr: string): string {
  let result = '';
  let insideString = false;
  let isEscaped = false;

  for (let i = 0; i < jsonStr.length; i += 1) {
    const char = jsonStr[i];
    const code = jsonStr.charCodeAt(i);

    if (insideString && !isEscaped && code < 0x20) {
      switch (char) {
        case '\n': result += '\\n'; break;
        case '\r': result += '\\r'; break;
        case '\t': result += '\\t'; break;
        default: result += '\\u' + code.toString(16).padStart(4, '0');
      }
      continue;
    }

    result += char;

    if (isEscaped) {
      isEscaped = false;
    } else if (char === '\\' && insideString) {
      isEscaped = true;
    } else if (char === '"') {
      insideString = !insideString;
    }
  }

  return result;
}

/**
 * Extrait les données de documents avec Claude AI (version simplifiée)
 * Cette fonction prend des URLs de documents et les télécharge avant extraction
 * @param options - Options d'extraction
 * @returns Données extraites
 */
export async function prepareDocumentsForClaude(documents_urls: string[]) {
  const documentContents = await Promise.all(
    documents_urls.map(async (url, index) => {
      assertAllowedFetchUrl(url);
      console.log(`📥 Téléchargement document ${index + 1}:`, url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Échec téléchargement: ${response.status} ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');
      const pathname = new URL(url).pathname.toLowerCase();
      const isPDF = pathname.endsWith('.pdf');
      const isJPEG = pathname.match(/\.(jpg|jpeg)$/);
      const isPNG = pathname.endsWith('.png');
      const isGIF = pathname.endsWith('.gif');
      const isWebP = pathname.endsWith('.webp');
      if (isPDF) {
        return {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64Data },
        };
      }
      const imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null =
        isJPEG ? 'image/jpeg' : isPNG ? 'image/png' : isGIF ? 'image/gif' : isWebP ? 'image/webp' : null;
      if (!imageMediaType) throw new Error(`Type de document non supporté: ${pathname}`);
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: imageMediaType, data: base64Data },
      };
    })
  );
  console.log(`✅ ${documentContents.length} document(s) préparé(s) pour Claude`);
  return documentContents;
}

export async function extractDataFromDocuments(options: {
  documents_urls: string[];
  champs_actifs: string[];
  prompt_template: string;
  claude_model: string;
  claude_effort?: string | null;
}): Promise<WithUsage<Record<string, unknown>>> {
  const { documents_urls, champs_actifs, prompt_template, claude_model } = options;
  if (isDeepSeekSaModel(claude_model)) throw new Error('DeepSeek V4.1 Flash est réservé au pipeline SA.');
  const documentContents = await prepareDocumentsForClaude(documents_urls);

  // Construire le prompt final
  const finalPrompt = prompt_template
    .replace('{liste_champs_actifs}', champs_actifs.map(f => `- ${f}`).join('\n'))
    .replace('{documents}', '[Documents fournis ci-dessus]')
    .replace('{secteur}', 'télécom'); // Valeur par défaut

  // Appel à Claude
  console.log(`🤖 Appel à Claude avec modèle: ${claude_model || 'claude-sonnet-4-5-20250929'}`);
  console.log(`📝 Nombre de champs à extraire: ${champs_actifs.length}`);
  
  try {
    const modelToUse = claude_model || process.env.CLAUDE_MODEL_EXTRACTION || DEFAULT_CLAUDE_MODEL;
    const effortConfig = buildClaudeEffortConfig(modelToUse, options.claude_effort);

    const message = await anthropic.messages.create({
      model: modelToUse,
      // Le JSON de situation_actuelle (lignes + abonnements + locations + engagements)
      // dépasse régulièrement 8192 tokens sur les dossiers multi-sites. Une troncature
      // se manifeste ici par un JSON.parse en erreur plus bas, sans message explicite.
      max_tokens: 16000,
      ...buildClaudeModelOptions(modelToUse),
      ...(effortConfig.effort ? { output_config: effortConfig } : {}),
      messages: [
        {
          role: 'user',
          content: [
            ...documentContents,
            {
              type: 'text',
              text: finalPrompt,
            },
          ],
        },
      ],
    });

    console.log(`✅ Réponse reçue de Claude`);
    console.log(`📊 Tokens utilisés - Input: ${message.usage.input_tokens}, Output: ${message.usage.output_tokens}`);

    // Parser la réponse (ignore les blocs "thinking" éventuels, ne prend que le texte)
    const textBlock = message.content.find((block) => block.type === 'text');
    const responseText = textBlock ? textBlock.text : '';

    console.log(`📄 Longueur de la réponse: ${responseText.length} caractères`);

    // Nettoyer et parser le JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

    const parsedData = JSON.parse(sanitizeJsonControlCharacters(jsonStr)) as unknown;
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);
    if (!isPlainObject(parsedData)) {
      throw new Error('Réponse JSON inattendue');
    }
    console.log(`✅ Données brutes extraites: ${Object.keys(parsedData).length} champs`);
    
    // Filtrer pour ne garder que les champs demandés
    if (champs_actifs && champs_actifs.length > 0) {
      const filteredData: Record<string, unknown> = {};
      
      for (const champ of champs_actifs) {
        // Chercher le champ directement ou avec des variantes
        const champLower = champ.toLowerCase();
        const champNormalized = champ.replace(/\s+/g, '_').toLowerCase();
        
        // Chercher dans les données extraites
        for (const [key, value] of Object.entries(parsedData)) {
          const keyLower = key.toLowerCase();
          const keyNormalized = key.replace(/\s+/g, '_').toLowerCase();
          
          if (keyLower === champLower || 
              keyNormalized === champNormalized ||
              keyLower.includes(champLower) ||
              champLower.includes(keyLower)) {
            filteredData[key] = value;
            break;
          }
        }
      }

      const normalizeKey = (k: string) =>
        k
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '_');

      const resumeKey = Object.keys(parsedData).find((k) => normalizeKey(k) === 'resume');
      if (resumeKey) {
        const v = parsedData[resumeKey];
        if (typeof v === 'string' && v.trim()) filteredData['resume'] = v;
      }
      
      console.log(`✅ Données filtrées: ${Object.keys(filteredData).length} champs (sur ${champs_actifs.length} demandés)`);
      return { data: filteredData, usage: readUsage(message.usage, modelToUse) };
    }

    return { data: parsedData, usage: readUsage(message.usage, modelToUse) };
  } catch (error: unknown) {
    console.error(`❌ Erreur lors de l'appel à Claude:`, error);
    const maybeError = error as { message?: unknown; response?: unknown };
    console.error(`📋 Détails de l'erreur:`, typeof maybeError?.message === 'string' ? maybeError.message : String(error));
    if (maybeError?.response) {
      console.error(`📋 Réponse d'erreur:`, JSON.stringify(maybeError.response, null, 2));
    }
    throw error;
  }
}

export async function analyzeInvoicesForSa(options: {
  documents_urls: string[];
  active_fields: string[];
  claude_model: string;
  claude_effort?: string | null;
}): Promise<WithUsage<InvoiceAnalysisReport>> {
  const documentContents = isDeepSeekSaModel(options.claude_model)
    ? await prepareDocumentsForDeepSeek(options.documents_urls)
    : await prepareDocumentsForClaude(options.documents_urls);
  const fields = options.active_fields.map((field) => `- ${field}`).join('\n');
  const prompt = `Tu es un analyste expert des factures télécom B2B. Ta priorité absolue est de déterminer exactement le TOTAL HT MENSUEL réellement payé par le client sur l'ensemble des documents.

Lis chaque document intégralement. Sépare les montants HT et TTC, conserve le signe des remises, distingue les frais récurrents des frais ponctuels et détermine le nombre exact de mois couvert par chaque montant à partir des mentions et des dates. Une facture couvrant deux mois doit être divisée par 2.

RÈGLE DE PÉRIODICITÉ : le champ billing_months de chaque ligne est le nombre de mois couverts par le montant de CETTE ligne, même si elle figure sur une facture mensuelle. Un montant facturé trimestriellement (« par trimestre ») vaut billing_months 3, semestriellement 6, annuellement (« par an », « annuel ») 12. Le montant source reste celui imprimé sur la facture : ne le divise jamais toi-même, le calcul mensuel est fait ensuite à partir de billing_months. Sans mention de périodicité ni période propre à la ligne, utilise le nombre de mois de la facture. Une maintenance, redevance, licence ou assistance facturée annuellement ou semestriellement est une ligne récurrente (subscription ou other), jamais one_time.

RÈGLE ÉCHÉANCIER : un échéancier (tableau d'échéances d'un contrat de location ou de financement) n'est pas une facture. Crée UNE SEULE ligne (catégorie location) avec le loyer hors taxes d'UNE échéance, jamais une ligne par échéance. Son billing_months correspond à la périodicité d'une échéance (mensuelle = 1, trimestrielle = 3, semestrielle = 6, annuelle = 12). Pour ce document, period_start et period_end couvrent UNE échéance (et non la durée du contrat), billing_months de la facture vaut 1, et printed_total_ht reste à 0 s'il n'existe pas de total imprimé. Ne retiens que la colonne loyer hors taxes : ignore les colonnes taxes et « règlement à effectuer » (TTC) ainsi que les assurances vides. Les dates de première et de dernière échéance ne sont pas une période de facturation : utilise-les pour les champs d'engagement ou de fin de contrat demandés dans les champs actifs.

RÈGLE DE CATÉGORISATION : les appels ou communications vers des services spéciaux, numéros spéciaux ou SVA, ainsi que le hors-forfait, sont toujours de catégorie variable, même si la facture les décrit comme ponctuels, comme achats, comme provenant d'autres fournisseurs, ou si recurring=false. La catégorie one_time est réservée aux frais réellement uniques tels que mise en service, installation, activation ou achat de matériel.

Pour chaque ligne financière, donne le montant source signé, la quantité, indique si ce montant est unitaire ou total, sa périodicité, le nombre de mois, et une seule preuve : index du document, page si disponible, et un extrait de texte source court (15 mots maximum) reprenant uniquement le libellé et le montant concernés, jamais la ligne entière ni le contexte autour. Ajoute une deuxième preuve seulement si le montant provient réellement de deux emplacements distincts. Une remise doit utiliser la catégorie discount et sera normalisée comme un montant négatif.

Tu dois également traiter chacun des champs actifs ci-dessous. Ajoute exactement une entrée field_coverage par champ, avec le nom strictement identique. Utilise found avec value_json contenant la valeur sérialisée en JSON, not_found si le document ne contient pas l'information, ou ambiguous si elle est incertaine. Aucun champ ne doit être omis. Laisse le tableau evidence vide pour un champ not_found ; pour un champ found ou ambiguous, fournis au maximum une preuve avec un extrait de 15 mots maximum. Le schéma n'accepte pas null : utilise une chaîne vide pour un texte absent, 0 pour un montant ou une page absente, et -1 pour un taux de TVA absent.

CHAMPS ACTIFS:
${fields}

Le résumé (summary) tient en 3 à 5 phrases : le total HT mensuel de chaque facture, puis le total HT mensuel client. Pas de reformulation détaillée du parc ni de recopie des lignes.`;
  if (isDeepSeekSaModel(options.claude_model)) {
    const result = await callDeepSeekStructured({
      prompt, schema: InvoiceAnalysisAiSchema, toolName: 'analyse_sa', maxTokens: 64000, documents: documentContents,
    });
    return { data: normalizeInvoiceAnalysisOutput(result.data), usage: result.usage };
  }
  const stream = anthropic.messages.stream({
    model: options.claude_model,
    // Requête en streaming : pas de risque de timeout HTTP, on laisse donc une
    // marge large. La sortie JSON (lignes de facture + evidence cité mot pour
    // mot + field_coverage) dépassait 24000 tokens sur les gros dossiers, ce qui
    // tronquait le JSON et faisait échouer le parsing structuré du SDK.
    max_tokens: getClaudeMaxOutputTokens(options.claude_model, 64000),
    ...buildClaudeModelOptions(options.claude_model),
    messages: [{
      role: 'user',
      content: [...documentContents, { type: 'text', text: prompt }],
    }],
    output_config: {
      format: zodOutputFormat(InvoiceAnalysisAiSchema),
      ...buildClaudeEffortConfig(options.claude_model, options.claude_effort),
    },
  });
  const message = await stream.finalMessage();
  const usage = readUsage(message.usage, options.claude_model);
  // L'appel a déjà été facturé en entier : l'erreur transporte sa consommation
  // pour que la dépense soit enregistrée malgré l'échec.
  if (!message.parsed_output) {
    throw new ClaudeCallError("L'analyse comptable Claude n'a pas retourné de résultat structuré.", usage);
  }
  return { data: normalizeInvoiceAnalysisOutput(message.parsed_output), usage };
}

export async function structureSaAnalysis(options: {
  report: InvoiceAnalysisReport;
  canonical: CanonicalSaAnalysis;
  active_fields: string[];
  claude_model: string;
}): Promise<WithUsage<StructuredSa>> {
  const prompt = `Tu es un agent de structuration. Tu ne relis pas les factures et tu ne refais aucun calcul. Transforme fidèlement le rapport d'analyse fourni dans le schéma demandé.

Tous les champs actifs doivent être représentés à partir de field_coverage. Ajoute exactement une entrée mapped_fields pour chaque champ actif, avec le nom strictement identique et la valeur sérialisée dans value_json. Le schéma n'accepte pas null : utilise une chaîne vide pour un texte ou une value_json absente, et 0 pour preavis_mois absent. Une donnée marquée not_found utilise value_json="" et reste absente ou un tableau vide dans la structure. N'invente aucune information. Ne modifie jamais total_ht_mensuel_client ni les montants canoniques: le backend les injectera après ta réponse.

CHAMP resume — rédige un résumé en français, structuré en Markdown léger (titres "## ", listes "- ", **gras** pour les libellés), basé UNIQUEMENT sur le rapport et les calculs fournis. Ne recopie pas les factures, n'invente rien, écris "(non trouvé)" pour une information absente. 1 à 3 puces par section, en gardant exactement ces titres numérotés :
## 1. Client — raison sociale, SIRET/SIREN, contact, adresse
## 2. Opérateur & leaser — opérateur(s) télécom, organisme de financement le cas échéant
## 3. Documents analysés — type, numéro, période de facturation, nombre de mois couverts
## 4. Sites
## 5. Lignes & services — nombre, types (fixe/mobile/internet), forfaits notables
## 6. Abonnements — postes principaux avec montant mensuel HT
## 7. Locations & matériel
## 8. Remises
## 9. Engagements — références, dates de fin, dates limites de résiliation calculées
## 10. Totaux — total HT mensuel de chaque facture, puis total HT mensuel client avec le détail du calcul
## 11. INDEMNITÉS DE RÉSILIATION — montant retenu et méthode
## 12. Synthèse — 3 à 6 puces exploitables pour la proposition commerciale

CHAMPS ACTIFS:
${options.active_fields.map((field) => `- ${field}`).join('\n')}

RAPPORT ANALYSTE:
${JSON.stringify(options.report)}

CALCULS CANONIQUES:
${JSON.stringify(options.canonical)}`;
  if (isDeepSeekSaModel(options.claude_model)) {
    const result = await callDeepSeekStructured({
      prompt, schema: StructuredSaAiSchema, toolName: 'structure_sa', maxTokens: 32000,
    });
    return { data: normalizeStructuredSaOutput(result.data), usage: result.usage };
  }
  const stream = anthropic.messages.stream({
    model: options.claude_model,
    // Streaming : marge élargie pour éviter la troncature du JSON structuré
    // (mapped_fields sur tous les champs actifs + structure SA complète).
    max_tokens: getClaudeMaxOutputTokens(options.claude_model, 32000),
    ...buildClaudeModelOptions(options.claude_model),
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: zodOutputFormat(StructuredSaAiSchema),
      // Structuration = pur remapping : effort minimal imposé, quel que soit le
      // réglage du template (qui ne pilote que l'analyse des factures).
      ...buildClaudeEffortConfig(options.claude_model, STRUCTURING_CLAUDE_EFFORT),
    },
  });
  const message = await stream.finalMessage();
  const usage = readUsage(message.usage, options.claude_model);
  if (!message.parsed_output) {
    throw new ClaudeCallError("La structuration Claude n'a pas retourné de résultat structuré.", usage);
  }
  return { data: normalizeStructuredSaOutput(message.parsed_output), usage };
}

