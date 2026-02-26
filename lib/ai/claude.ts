// Client Claude AI pour l'extraction de données
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { ExtractionResult } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * Extrait les données de documents avec Claude AI
 * @param documentPaths - Chemins des documents à analyser
 * @param fieldsToExtract - Liste des champs à extraire
 * @param customPrompt - Prompt personnalisé du client
 * @param claudeModel - Modèle Claude à utiliser
 * @returns Résultat de l'extraction avec données, confiance et métriques
 */
export async function extractWithClaude(
  documentPaths: Array<{ path: string; type: string }>,
  fieldsToExtract: string[],
  customPrompt: string,
  claudeModel: string = process.env.CLAUDE_MODEL_EXTRACTION || 'claude-sonnet-4-6'
): Promise<ExtractionResult> {
  try {
    // Préparer les documents pour Claude
    const documentContents = documentPaths.map((doc) => {
      const buffer = fs.readFileSync(doc.path);
      const mediaType: 'application/pdf' = doc.type as 'application/pdf';
      return {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType,
          data: buffer.toString('base64'),
        },
      };
    });

    // Construire le prompt final
    const finalPrompt = customPrompt
      .replace('{liste_champs_actifs}', fieldsToExtract.map(f => `- ${f}`).join('\n'))
      .replace('{documents}', '[Documents fournis ci-dessus]');

    // Appel à Claude
    const message = await anthropic.messages.create({
      model: claudeModel,
      max_tokens: 8192,
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

    // Parser la réponse
    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Nettoyer et parser le JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    const extractedData = JSON.parse(jsonStr);

    // Calculer le coût (Prix Claude 3.5 Sonnet : $3/MTok input, $15/MTok output)
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const cost = (inputTokens * 0.003) / 1000 + (outputTokens * 0.015) / 1000;

    // Extraire les scores de confiance
    const confidence: Record<string, number> = {};
    for (const field of fieldsToExtract) {
      // Si Claude retourne un format {valeur: "...", confiance: 95}
      if (
        extractedData[field] &&
        typeof extractedData[field] === 'object' &&
        'confidence' in extractedData[field]
      ) {
        confidence[field] = extractedData[field].confidence;
        extractedData[field] = extractedData[field].value;
      } else {
        // Sinon, confiance par défaut 100%
        confidence[field] = extractedData[field] ? 100 : 0;
      }
    }

    return {
      data: extractedData,
      confidence,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      cost,
    };
  } catch (error) {
    console.error('Erreur extraction Claude:', error);
    throw new Error(
      `Échec de l'extraction avec Claude: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Valide que la clé API Claude est configurée
 */
export function validateClaudeApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Extrait les données de documents avec Claude AI (version simplifiée)
 * Cette fonction prend des URLs de documents et les télécharge avant extraction
 * @param options - Options d'extraction
 * @returns Données extraites
 */
export async function extractDataFromDocuments(options: {
  documents_urls: string[];
  champs_actifs: string[];
  prompt_template: string;
  claude_model: string;
}): Promise<Record<string, unknown>> {
  const { documents_urls, champs_actifs, prompt_template, claude_model } = options;

  // Télécharger les documents depuis les URLs
  const documentContents = await Promise.all(
    documents_urls.map(async (url, index) => {
      console.log(`📥 Téléchargement document ${index + 1}:`, url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Échec téléchargement: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      const bufferSize = buffer.byteLength;
      console.log(`📦 Taille du fichier: ${(bufferSize / 1024).toFixed(2)} KB`);
      
      const base64Data = Buffer.from(buffer).toString('base64');
      const base64Size = base64Data.length;
      console.log(`📊 Taille base64: ${(base64Size / 1024).toFixed(2)} KB`);
      
      // Vérifier que le base64 commence bien par les magic bytes d'un PDF
      const pdfMagicBytes = base64Data.substring(0, 20);
      console.log(`🔍 Début du base64:`, pdfMagicBytes);
      
      // Détecter le type de fichier depuis l'URL
      const isPDF = url.toLowerCase().endsWith('.pdf');
      const isJPEG = url.toLowerCase().match(/\.(jpg|jpeg)$/);
      const isPNG = url.toLowerCase().endsWith('.png');

      // Pour les PDFs, utiliser le type "document"
      if (isPDF) {
        console.log(`📄 Type détecté: PDF`);
        return {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64Data,
          },
        };
      }
      
      // Pour les images, utiliser le type "image"
      console.log(`🖼️ Type détecté: Image`);
      const imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 
        isJPEG ? 'image/jpeg' : isPNG ? 'image/png' : 'image/jpeg';
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: imageMediaType,
          data: base64Data,
        },
      };
    })
  );
  
  console.log(`✅ ${documentContents.length} document(s) préparé(s) pour Claude`);

  // Construire le prompt final
  const finalPrompt = prompt_template
    .replace('{liste_champs_actifs}', champs_actifs.map(f => `- ${f}`).join('\n'))
    .replace('{documents}', '[Documents fournis ci-dessus]')
    .replace('{secteur}', 'télécom'); // Valeur par défaut

  // Appel à Claude
  console.log(`🤖 Appel à Claude avec modèle: ${claude_model || 'claude-sonnet-4-5-20250929'}`);
  console.log(`📝 Nombre de champs à extraire: ${champs_actifs.length}`);
  
  try {
    const message = await anthropic.messages.create({
      model: claude_model || process.env.CLAUDE_MODEL_EXTRACTION || 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0,
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

    // Parser la réponse
    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    console.log(`📄 Longueur de la réponse: ${responseText.length} caractères`);

    // Nettoyer et parser le JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    
    const parsedData = JSON.parse(jsonStr) as unknown;
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
      return filteredData;
    }
    
    return parsedData;
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

/**
 * Estime le coût d'une extraction basée sur la taille des documents
 * @param documentSizesMB - Tailles des documents en MB
 * @returns Coût estimé en euros
 */
export function estimateExtractionCost(documentSizesMB: number[]): number {
  // Estimation approximative : 1MB ≈ 300 tokens
  const totalTokens = documentSizesMB.reduce((sum, size) => sum + size * 300, 0);
  
  // Ajouter les tokens de sortie estimés (environ 500 tokens)
  const inputTokens = totalTokens;
  const outputTokens = 500;
  
  // Calculer le coût
  const cost = (inputTokens * 0.003) / 1000 + (outputTokens * 0.015) / 1000;
  
  return Math.round(cost * 100) / 100; // Arrondir à 2 décimales
}
