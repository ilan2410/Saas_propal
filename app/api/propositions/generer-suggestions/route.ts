import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateClaudeApiKey } from '@/lib/ai/claude';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonFromText(text: string): unknown {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  return JSON.parse(jsonStr);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function extractMonthlyPrice(line: UnknownRecord): number {
  const keys = [
    'prix_mensuel',
    'montant_mensuel',
    'tarif_mensuel',
    'cout_mensuel',
    'prix',
    'tarif',
    'montant',
    'total_ht',
    'total',
  ];

  for (const k of keys) {
    const num = toNumber(line[k]);
    if (num !== null) return num;
  }

  for (const v of Object.values(line)) {
    const num = toNumber(v);
    if (num !== null) return num;
  }

  return 0;
}

function shouldExcludePath(pathLower: string): boolean {
  const excluded = [
    'contact',
    'contacts',
    'adresse',
    'adresses',
    'facturation',
    'releve',
    'releves',
    'compteur',
    'compteurs',
    'engagement',
    'engagements',
    'document',
    'documents',
    'fichier',
    'fichiers',
    'piece',
    'pieces',
    'materiel',
    'materiels',
    'location',
    'locations',
    'maintenance',
  ];
  return excluded.some((t) => pathLower.includes(t));
}

function looksLikeTelecomLinesPath(pathLower: string): boolean {
  const hints = [
    'ligne',
    'lignes',
    'service',
    'services',
    'abonnement',
    'abonnements',
    'forfait',
    'forfaits',
    'mobile',
    'fixe',
    'internet',
    'fibre',
    'adsl',
    'box',
    'telephonie',
    'telecom',
    'sim',
  ];
  return hints.some((t) => pathLower.includes(t));
}

function looksLikeLineItem(item: UnknownRecord): boolean {
  const keys = Object.keys(item);
  if (keys.length === 0) return false;

  const hasUsefulKey = keys.some((k) => {
    const kl = k.toLowerCase();
    return (
      kl.includes('prix') ||
      kl.includes('tarif') ||
      kl.includes('montant') ||
      kl.includes('cout') ||
      kl.includes('forfait') ||
      kl.includes('type') ||
      kl.includes('categorie') ||
      kl.includes('numero') ||
      kl.includes('debit') ||
      kl.includes('data')
    );
  });

  if (hasUsefulKey) return true;

  const hasPrimitive = Object.values(item).some((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
  return hasPrimitive && keys.length >= 2;
}

function collectLinesToAnalyze(situationActuelle: unknown): UnknownRecord[] {
  const results: UnknownRecord[] = [];
  const seen = new Set<string>();

  const addLine = (line: UnknownRecord, path: string, index: number) => {
    const stableKey = JSON.stringify(line);
    if (seen.has(stableKey)) return;
    seen.add(stableKey);
    results.push({ ...line, __meta: { path, index } });
  };

  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      const pathLower = path.toLowerCase();
      if (shouldExcludePath(pathLower)) return;

      const objectItems = node.filter((v) => isPlainObject(v)) as UnknownRecord[];
      const isMostlyObjects = objectItems.length > 0 && objectItems.length / node.length >= 0.6;

      if (isMostlyObjects) {
        const isPreferred = looksLikeTelecomLinesPath(pathLower);
        for (let i = 0; i < objectItems.length; i += 1) {
          const item = objectItems[i];
          if (isPreferred || looksLikeLineItem(item)) addLine(item, path, i);
        }
      }

      return;
    }

    if (!isPlainObject(node)) return;
    for (const [k, v] of Object.entries(node)) {
      const nextPath = path ? `${path}.${k}` : k;
      walk(v, nextPath);
    }
  };

  walk(situationActuelle, '');

  if (results.length > 0) return results;
  if (isPlainObject(situationActuelle)) return [{ ...situationActuelle, __meta: { path: 'root', index: 0 } }];
  return [];
}

type SuggestionResult = {
  suggestions: Array<{
    ligne_actuelle: UnknownRecord;
    produit_propose_id?: string;
    produit_propose_nom: string;
    produit_propose_fournisseur?: string;
    prix_actuel: number;
    prix_propose: number;
    economie_mensuelle: number;
    justification: string;
  }>;
  synthese: {
    cout_total_actuel: number;
    cout_total_propose: number;
    economie_mensuelle: number;
    economie_annuelle: number;
    ameliorations?: string[];
  };
};

function buildFallbackSuggestion(line: UnknownRecord) {
  const prix = extractMonthlyPrice(line);
  return {
    ligne_actuelle: line,
    produit_propose_nom: 'Aucun produit similaire trouvé',
    prix_actuel: prix,
    prix_propose: prix,
    economie_mensuelle: 0,
    justification: "Aucun produit de votre catalogue ne semble correspondre à cette ligne/service.",
  };
}

function findSupplierInCatalogue(catalogue: unknown[], produitId?: string, produitNom?: string): string | undefined {
  const id = typeof produitId === 'string' && produitId.trim() ? produitId.trim() : undefined;
  const nom = typeof produitNom === 'string' && produitNom.trim() ? produitNom.trim().toLowerCase() : undefined;

  if (!id && !nom) return undefined;

  for (const item of catalogue) {
    if (!isPlainObject(item)) continue;

    const itemId = typeof item.id === 'string' ? item.id : undefined;
    const itemNom = typeof item.nom === 'string' ? item.nom : undefined;
    const itemFournisseur = typeof item.fournisseur === 'string' ? item.fournisseur : undefined;

    if (!itemFournisseur) continue;

    if (id && itemId === id) return itemFournisseur;
    if (nom && itemNom && itemNom.toLowerCase() === nom) return itemFournisseur;
  }

  return undefined;
}

function normalizeResult(raw: unknown, lines: UnknownRecord[], catalogue: unknown[]): SuggestionResult {
  const empty: SuggestionResult = {
    suggestions: lines.map((l) => buildFallbackSuggestion(l)),
    synthese: {
      cout_total_actuel: 0,
      cout_total_propose: 0,
      economie_mensuelle: 0,
      economie_annuelle: 0,
      ameliorations: ['Aucun produit similaire trouvé dans le catalogue'],
    },
  };

  if (!isPlainObject(raw)) return empty;
  const rawSuggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];
  const rawSynthese = isPlainObject(raw.synthese) ? raw.synthese : {};

  const suggestions = rawSuggestions
    .map((s) => (isPlainObject(s) ? (s as UnknownRecord) : null))
    .filter(Boolean)
    .map((s) => {
      const ligneActuelle = isPlainObject(s!.ligne_actuelle) ? (s!.ligne_actuelle as UnknownRecord) : {};
      const prixActuel = toNumber(s!.prix_actuel) ?? extractMonthlyPrice(ligneActuelle);
      const prixPropose = toNumber(s!.prix_propose) ?? prixActuel;
      const economieMensuelle = toNumber(s!.economie_mensuelle) ?? prixActuel - prixPropose;
      const produitProposeNom =
        typeof s!.produit_propose_nom === 'string' && s!.produit_propose_nom.trim()
          ? s!.produit_propose_nom
          : 'Aucun produit similaire trouvé';
      const justification =
        typeof s!.justification === 'string' && s!.justification.trim()
          ? s!.justification
          : "Aucun produit de votre catalogue ne semble correspondre à cette ligne/service.";

      const out: SuggestionResult['suggestions'][number] = {
        ligne_actuelle: ligneActuelle,
        produit_propose_nom: produitProposeNom,
        prix_actuel: prixActuel,
        prix_propose: prixPropose,
        economie_mensuelle: economieMensuelle,
        justification,
      };

      if (typeof s!.produit_propose_id === 'string' && s!.produit_propose_id.trim()) {
        out.produit_propose_id = s!.produit_propose_id;
      }

      const fournisseur = findSupplierInCatalogue(catalogue, out.produit_propose_id, out.produit_propose_nom);
      if (fournisseur) out.produit_propose_fournisseur = fournisseur;

      return out;
    });

  const targetCount = Math.max(0, lines.length);
  const resized =
    suggestions.length >= targetCount
      ? suggestions.slice(0, targetCount)
      : suggestions.concat(lines.slice(suggestions.length).map((l) => buildFallbackSuggestion(l)));

  const coutTotalActuel = resized.reduce((sum, s) => sum + (Number.isFinite(s.prix_actuel) ? s.prix_actuel : 0), 0);
  const coutTotalPropose = resized.reduce((sum, s) => sum + (Number.isFinite(s.prix_propose) ? s.prix_propose : 0), 0);
  const economieMensuelle = coutTotalActuel - coutTotalPropose;
  const economieAnnuelle = economieMensuelle * 12;

  const ameliorations = Array.isArray(rawSynthese.ameliorations)
    ? rawSynthese.ameliorations.filter((v) => typeof v === 'string') as string[]
    : undefined;

  return {
    suggestions: resized,
    synthese: {
      cout_total_actuel: coutTotalActuel,
      cout_total_propose: coutTotalPropose,
      economie_mensuelle: economieMensuelle,
      economie_annuelle: economieAnnuelle,
      ameliorations,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!validateClaudeApiKey()) {
      return NextResponse.json(
        {
          error: 'Clé API Claude non configurée',
          details: "La variable ANTHROPIC_API_KEY n'est pas définie",
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { situation_actuelle, catalogue, preferences, proposition_id } = body ?? {};

    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const { data: proposition, error: propError } = await supabase
        .from('propositions')
        .select('id, suggestions_generees')
        .eq('id', proposition_id)
        .eq('organization_id', user.id)
        .single();

      if (propError || !proposition) {
        return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });
      }

      if (proposition.suggestions_generees) {
        return NextResponse.json(proposition.suggestions_generees);
      }
    }

    if (!Array.isArray(catalogue)) {
      return NextResponse.json({ error: 'catalogue invalide' }, { status: 400 });
    }

    const objectif = preferences?.objectif || 'equilibre';
    const budgetMax = preferences?.budget_max;
    const lignesAAnalyser = collectLinesToAnalyze(situation_actuelle ?? {});

    const prompt = `Tu es un expert en télécommunications. Analyse la situation actuelle du client et propose la meilleure combinaison de produits de notre catalogue.

SITUATION ACTUELLE:
${JSON.stringify(situation_actuelle ?? {}, null, 2)}

LIGNES À ANALYSER (${lignesAAnalyser.length} éléments, ordre imposé):
${JSON.stringify(lignesAAnalyser, null, 2)}

NOTRE CATALOGUE (${catalogue.length} produits):
${JSON.stringify(catalogue, null, 2)}

OBJECTIF: ${objectif}
${budgetMax ? `BUDGET MAX: ${budgetMax}€/mois` : ''}

INSTRUCTIONS:
1. Pour CHAQUE élément de "LIGNES À ANALYSER" (et dans le même ordre), retourne exactement 1 entrée dans "suggestions"
2. La longueur de "suggestions" DOIT être exactement ${lignesAAnalyser.length}
3. Pour chaque entrée:
   - "ligne_actuelle" doit être l'élément correspondant de "LIGNES À ANALYSER"
   - "produit_propose_id" doit être l'id d'un produit existant du catalogue (ou omis si aucun produit ne convient)
   - "produit_propose_nom" doit être le nom exact d'un produit existant du catalogue (ou "Aucun produit similaire trouvé" si aucun produit ne convient)
   - Si aucun produit ne convient: mets "prix_propose" = "prix_actuel" et "economie_mensuelle" = 0, et explique pourquoi
2. Privilégie ${
      objectif === 'economie'
        ? 'les économies maximales'
        : objectif === 'performance'
          ? 'la meilleure performance'
          : "l'équilibre coût/performance"
    }
3. Calcule les économies mensuelles et annuelles selon la formule :
   • economie_mensuelle = prix_actuel - prix_propose
   • Si le résultat est POSITIF → économie réelle
   • Si le résultat est NÉGATIF → surcoût (produit proposé plus cher)
4. Justifie chaque choix
5. Ne propose JAMAIS un produit qui n'existe pas dans NOTRE CATALOGUE

RETOURNE UN JSON:
{
  "suggestions": [
    {
      "ligne_actuelle": {...},
      "produit_propose_id": "uuid",
      "produit_propose_nom": "...",
      "prix_actuel": 0,
      "prix_propose": 0,
      "economie_mensuelle": 0,  // = prix_actuel - prix_propose (positif = économie, négatif = surcoût)
      "justification": "..."
    }
  ],
  "synthese": {
    "cout_total_actuel": 0,
    "cout_total_propose": 0,
    "economie_mensuelle": 0,  // = cout_total_actuel - cout_total_propose
    "economie_annuelle": 0,   // = economie_mensuelle * 12
    "ameliorations": ["..."]
  }
}

IMPORTANT - GESTION DES SURCOÛTS:
- Si le produit proposé est plus cher, l'économie_mensuelle sera NÉGATIVE
- Dans la justification, explique clairement pourquoi le surcoût est justifié (meilleure performance, engagement plus court, etc.)
- L'objectif "${objectif}" doit guider tes choix, même si cela implique un léger surcoût pour une meilleure performance ou qualité`;

    const preferredModel = 'claude-sonnet-4-20250514';
    const fallbackModel = 'claude-3-7-sonnet-20250219';

    let result;

    try {
      const message = await anthropic.messages.create({
        model: preferredModel,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      result = extractJsonFromText(text);
    } catch {
      const message = await anthropic.messages.create({
        model: fallbackModel,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      result = extractJsonFromText(text);
    }

    const normalized = normalizeResult(result, lignesAAnalyser, catalogue);

    // Sauvegarde en BDD si proposition_id est présent
    if (typeof proposition_id === 'string' && proposition_id.length > 0) {
      const { error: updateError } = await supabase
        .from('propositions')
        .update({ 
          suggestions_generees: normalized,
        })
        .eq('id', proposition_id)
        .eq('organization_id', user.id);
      
      if (updateError) {
        console.error('Erreur sauvegarde suggestions:', updateError);
      }
    }

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json({ error: 'Erreur génération suggestions' }, { status: 500 });
  }
}
