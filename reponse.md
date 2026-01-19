merci, est ce que avec l'API de Claude on peut uploader des fichiers pdf pour extraction de données ?

Oui, absolument ! 📄✅
Claude API supporte nativement l'upload de fichiers PDF pour l'extraction de données. C'est même l'une de ses forces principales !

📋 Formats supportés par Claude API
Claude peut lire directement ces formats via l'API :

Format	Extension	Support	Notes
PDF	.pdf	✅ Excellent	Texte natif ou scanné (OCR intégré)
Images	.jpg, .jpeg, .png, .gif, .webp	✅ Excellent	Vision native
Documents Office	.docx, .xlsx, .pptx	❌ Non direct	Convertir en PDF ou extraire le texte
🎯 Comment ça fonctionne avec les PDF
Méthode 1 : Upload direct de PDF (Recommandé)
Claude API accepte les PDF en base64 avec le type document :

typescript
// lib/ai/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function extractFromPDF(pdfPath: string, fieldsToExtract: string[]) {
  // Lire le PDF et convertir en base64
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64PDF = pdfBuffer.toString('base64');
  
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document", // 🔥 Type spécial pour documents
            source: {
              type: "base64",
              media_type: "application/pdf", // Type MIME du PDF
              data: base64PDF,
            },
          },
          {
            type: "text",
            text: `
Analyse ce document PDF et extrais les informations suivantes en JSON :

${fieldsToExtract.map(field => `- ${field}`).join('\n')}

Réponds UNIQUEMENT en JSON valide.
            `
          }
        ],
      },
    ],
  });
  
  const responseText = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';
  
  return JSON.parse(responseText);
}
✨ Avantages de l'upload direct PDF
1. OCR intégré 🔍
Claude peut lire :

✅ PDFs avec texte natif (générés par ordinateur)
✅ PDFs scannés (images de documents)
✅ PDFs mixtes (texte + images)
✅ PDFs avec tableaux complexes
2. Préservation de la mise en forme 📐
Claude comprend :

Position des éléments
Tableaux et leurs colonnes
En-têtes et sections
Relations visuelles entre les données
3. Multi-pages 📚
Claude peut traiter des PDFs de plusieurs pages en une seule requête
Limite : Jusqu'à environ 100 pages (selon la complexité)
4. Pas besoin de librairie externe 🚀
Pas besoin de pdf-parse ou autres parsers
Claude gère tout nativement
🔥 Exemple concret : Extraction de facture PDF
typescript
// lib/ai/extract-invoice.ts
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface InvoiceData {
  nom_entreprise: string;
  adresse: string;
  numero_facture: string;
  date_facture: string;
  montant_ht: number;
  montant_ttc: number;
  tva: number;
  lignes_facture: Array<{
    designation: string;
    quantite: number;
    prix_unitaire: number;
    total: number;
  }>;
}

export async function extractInvoiceFromPDF(pdfPath: string): Promise<InvoiceData> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64PDF = pdfBuffer.toString('base64');
  
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64PDF,
            },
          },
          {
            type: "text",
            text: `
Analyse cette facture PDF et extrais toutes les informations en JSON.

Structure JSON attendue :
{
  "nom_entreprise": "...",
  "adresse": "...",
  "numero_facture": "...",
  "date_facture": "YYYY-MM-DD",
  "montant_ht": 0.00,
  "montant_ttc": 0.00,
  "tva": 0.00,
  "lignes_facture": [
    {
      "designation": "...",
      "quantite": 0,
      "prix_unitaire": 0.00,
      "total": 0.00
    }
  ]
}

IMPORTANT :
- Extrais TOUTES les lignes de la facture
- Les montants doivent être des nombres (pas de strings)
- Les dates au format ISO (YYYY-MM-DD)
- Si une info est absente, mets null

Réponds UNIQUEMENT avec le JSON, rien d'autre.
            `
          }
        ],
      },
    ],
  });
  
  const responseText = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';
  
  // Nettoyer la réponse (au cas où il y aurait du markdown)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
  
  return JSON.parse(jsonStr);
}
Utilisation :
typescript
// Exemple d'utilisation
const invoiceData = await extractInvoiceFromPDF('./facture-client.pdf');

console.log(invoiceData);
// {
//   nom_entreprise: "SARL Dupont & Fils",
//   adresse: "12 Rue de la Paix, 75001 Paris",
//   numero_facture: "F-2024-001234",
//   date_facture: "2024-11-15",
//   montant_ht: 1250.00,
//   montant_ttc: 1500.00,
//   tva: 250.00,
//   lignes_facture: [
//     {
//       designation: "Maintenance téléphonique mensuelle",
//       quantite: 1,
//       prix_unitaire: 500.00,
//       total: 500.00
//     },
//     // ...
//   ]
// }
📊 Exemple : Extraction de contrat téléphonique
typescript
// lib/ai/extract-contract.ts
export async function extractTelecomContract(pdfPath: string) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64PDF = pdfBuffer.toString('base64');
  
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64PDF,
            },
          },
          {
            type: "text",
            text: `
Tu es un expert en analyse de contrats télécom. Analyse ce contrat PDF et extrais :

INFORMATIONS CLIENT :
- Nom de l'entreprise
- Adresse complète
- SIRET
- Contact (nom, email, téléphone)

INFORMATIONS CONTRAT :
- Opérateur actuel
- Date de début du contrat
- Date de fin du contrat
- Durée d'engagement restante
- Préavis de résiliation
- Numéro de contrat

LIGNES TÉLÉPHONIQUES :
- Nombre de lignes mobiles
- Nombre de lignes fixes
- Forfaits actuels (détails)
- Minutes incluses
- Data mobile (Go)

ÉQUIPEMENTS :
- Téléphones fournis (marques/modèles)
- État (location ou achat)

TARIFICATION :
- Abonnement mensuel HT
- Abonnement mensuel TTC
- Coût par minute hors forfait
- Frais supplémentaires éventuels
- Total annuel estimé

PÉNALITÉS :
- Frais de résiliation anticipée
- Conditions de sortie

Réponds en JSON structuré. Si une information n'est pas présente, mets null.
            `
          }
        ],
      },
    ],
  });
  
  const responseText = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';
  
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
}
🎯 Cas d'usage pour votre projet PropoBoost
Scénario typique :
Le client upload 3 documents :

Facture télécom actuelle (PDF scanné)
Contrat en cours (PDF)
Relevé de consommation (PDF)
Code d'extraction :

typescript
// app/api/organizations/propositions/[id]/extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { extractWithClaude } from '@/lib/ai/claude';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tempFiles: string[] = [];
  
  try {
    const formData = await request.formData();
    const documents = formData.getAll('documents') as File[];
    
    // 1. Sauvegarder temporairement les PDFs
    const documentPaths: Array<{path: string, type: string}> = [];
    
    for (const doc of documents) {
      const buffer = await doc.arrayBuffer();
      const tempPath = path.join(os.tmpdir(), `${Date.now()}-${doc.name}`);
      await fs.promises.writeFile(tempPath, Buffer.from(buffer));
      tempFiles.push(tempPath);
      
      documentPaths.push({
        path: tempPath,
        type: doc.type // "application/pdf"
      });
    }
    
    // 2. Extraire avec Claude (supporte nativement les PDFs)
    const extractedData = await extractWithClaude(
      documentPaths,
      [
        'nom_entreprise',
        'adresse_complete',
        'operateur_actuel',
        'date_fin_contrat',
        'nombre_lignes',
        'forfaits_actuels',
        'cout_mensuel_ht',
        'cout_mensuel_ttc',
        'equipements_actuels',
        'volumes_mensuels'
      ]
    );
    
    return NextResponse.json({
      success: true,
      data: extractedData
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: 'Extraction failed' },
      { status: 500 }
    );
  } finally {
    // Nettoyer les fichiers temporaires
    for (const tempFile of tempFiles) {
      try {
        await fs.promises.unlink(tempFile);
      } catch (err) {
        console.error('Failed to delete temp file:', err);
      }
    }
  }
}
💡 Fonction générique pour multiples PDFs
typescript
// lib/ai/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function extractFromMultiplePDFs(
  pdfPaths: string[],
  fieldsToExtract: string[],
  customPrompt?: string
) {
  // Charger tous les PDFs en base64
  const documents = pdfPaths.map(pdfPath => {
    const buffer = fs.readFileSync(pdfPath);
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: buffer.toString('base64'),
      },
    };
  });
  
  const defaultPrompt = `
Analyse TOUS ces documents PDF (factures, contrats, relevés) et extrais les informations suivantes :

${fieldsToExtract.map(field => `- ${field}`).join('\n')}

INSTRUCTIONS :
- Si une information apparaît dans plusieurs documents, prends la plus récente
- Si une valeur est absente, mets null
- Pour les montants, utilise des nombres (pas de strings)
- Pour les dates, utilise le format ISO (YYYY-MM-DD)
- Agrège les informations de tous les documents

Réponds UNIQUEMENT en JSON valide, sans markdown ni texte autour.
  `;
  
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 16000, // Plus élevé pour plusieurs documents
    messages: [
      {
        role: "user",
        content: [
          ...documents, // Tous les PDFs
          {
            type: "text",
            text: customPrompt || defaultPrompt
          }
        ],
      },
    ],
  });
  
  const responseText = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';
  
  // Calculer le coût
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const cost = (inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000);
  
  // Parser le JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
  const data = JSON.parse(jsonStr);
  
  return {
    data,
    tokensUsed: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    },
    cost
  };
}
```

---

## ⚙️ Limites et considérations

### Limites techniques :

| Limite | Valeur | Notes |
|--------|--------|-------|
| **Taille max par PDF** | ~32 MB | En base64 |
| **Nombre de pages** | ~100 pages | Dépend de la complexité |
| **Nombre de PDFs simultanés** | ~5-10 PDFs | Total de tokens limité |
| **Tokens max par requête** | 200K tokens | Input + Output |

### Taille des fichiers en base64 :
```
Taille originale → Taille base64 (environ +33%)
1 MB  → 1.33 MB
5 MB  → 6.65 MB
10 MB → 13.3 MB
Recommandations :
Limiter à 5-10 MB par PDF pour de bonnes performances
Compresser les PDFs si nécessaire (ghostscript, Adobe)
Découper les gros PDFs en plusieurs fichiers si > 20 pages
Optimiser les images dans les PDFs scannés
🔥 Code optimisé pour votre projet
Voici la fonction finale à utiliser dans PropoBoost :

typescript
// lib/ai/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface ExtractionResult {
  data: Record<string, any>;
  confidence: Record<string, number>;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

export async function extractWithClaude(
  documentPaths: Array<{path: string, type: string}>,
  fieldsToExtract: string[],
  customPrompt: string
): Promise<ExtractionResult> {
  
  // Préparer les documents (PDFs, images, etc.)
  const documentContents = documentPaths.map(doc => {
    const buffer = fs.readFileSync(doc.path);
    
    // Détecter le type de document
    let mediaType = doc.type;
    
    // Si c'est un PDF
    if (doc.path.toLowerCase().endsWith('.pdf') || mediaType === 'application/pdf') {
      return {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: buffer.toString('base64'),
        },
      };
    }
    
    // Si c'est une image
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mediaType as any,
        data: buffer.toString('base64'),
      },
    };
  });
  
  // Construire le prompt final
  const finalPrompt = customPrompt
    .replace('{liste_champs_actifs}', fieldsToExtract.map(f => `- ${f}`).join('\n'));
  
  // Appel à Claude
  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          ...documentContents, // Tous les documents (PDFs + images)
          {
            type: "text",
            text: finalPrompt
          }
        ],
      },
    ],
  });
  
  // Parser la réponse
  const responseText = message.content[0].type === 'text' 
    ? message.content[0].text 
    : '';
  
  // Nettoyer et parser le JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
  const extractedData = JSON.parse(jsonStr);
  
  // Calculer le coût
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const cost = (inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000);
  
  // Extraire les scores de confiance
  const confidence: Record<string, number> = {};
  for (const field of fieldsToExtract) {
    if (extractedData[field]?.confidence) {
      confidence[field] = extractedData[field].confidence;
      extractedData[field] = extractedData[field].value;
    } else {
      confidence[field] = 100;
    }
  }
  
  return {
    data: extractedData,
    confidence,
    tokensUsed: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    },
    cost
  };
}
✅ Résumé
Oui, Claude API supporte nativement les PDFs ! 🎉

Avantages pour PropoBoost :
✅ Pas besoin de pdf-parse : Claude lit directement les PDFs
✅ OCR intégré : Fonctionne avec des PDFs scannés
✅ Multi-pages : Traite plusieurs pages en une requête
✅ Tableaux complexes : Comprend la structure et les relations
✅ Extraction précise : Excellente précision sur factures/contrats
✅ Multi-documents : Peut analyser plusieurs PDFs simultanément

Points d'attention :
⚠️ Taille : Limiter à 5-10 MB par PDF
⚠️ Tokens : Les PDFs consomment beaucoup de tokens
⚠️ Coût : Environ 0.05-0.15€ par extraction (2-3 documents)

Conclusion : Vous pouvez supprimer complètement pdf-parse de votre projet et laisser Claude gérer tous les PDFs nativement ! 🚀

C'est beaucoup plus simple et plus performant. 💪