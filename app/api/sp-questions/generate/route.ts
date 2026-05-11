import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `Tu es un expert en création de workflows de questions pour des propositions commerciales télécom B2B.
Tu aides les commerciaux à créer des séquences de questions structurées (appelées "questions SP") qui guident l'utilisateur lors de la création d'une Situation Proposée.

## Ton rôle — Conversation itérative
Tu dois parfaitement comprendre le workflow avant de générer le JSON.

1. Si la description est IMMÉDIATEMENT CLAIRE et complète → demande confirmation avant de générer
   - Exemple: "J'ai compris : [résumé en 1 phrase]. Veux-tu que je génère le workflow maintenant ?"
2. Si la description est ambiguë ou incomplète → pose UNE SEULE question ciblée à la fois
   - Attends la réponse de l'utilisateur
   - Continue à poser des questions si nécessaire, une par une
   - PAS de limite sur le nombre de questions
3. Accumule le contexte de toute la conversation pour affiner ta compréhension

Ne pose JAMAIS de questions pour des détails que tu peux déduire raisonnablement (labels, ordre, etc.).

## Schéma SpQuestion (TypeScript)

\`\`\`typescript
interface SpQuestion {
  id: string;              // Identifiant unique ex: "q_pto_type"
  template_id: string;     // Toujours "" (sera rempli à l'import)
  ordre: number;           // Position dans la séquence (1, 2, 3...)
  actif: boolean;          // Toujours true à la création
  libelle: string;         // Texte de la question affiché à l'utilisateur
  description?: string;    // Aide optionnelle sous le libelle
  source: 'catalogue' | 'sa' | 'aucune' | 'catalogue_et_sa';
  // 'catalogue' = choix depuis le catalogue produits
  // 'sa' = données extraites du document situation actuelle
  // 'aucune' = saisie libre par l'utilisateur
  // 'catalogue_et_sa' = combinaison des deux

  affichage:
    | 'boutons_choix_unique'    // Sélection d'un seul choix parmi des boutons
    | 'boutons_choix_multiple'  // Sélection multiple
    | 'liste_deroulante'        // Menu déroulant
    | 'oui_non'                 // Boutons Oui / Non
    | 'texte_court'             // Champ texte une ligne
    | 'texte_long'              // Zone texte multi-lignes
    | 'nombre'                  // Champ numérique
    | 'date'                    // Sélecteur de date
    | 'choix_liste_manuelle';   // Choix dans une liste définie dans options_manuelles

  options_manuelles?: string[]; // Requis si affichage = 'choix_liste_manuelle'
  obligatoire: boolean;
  priorite_ia: 'normale' | 'haute'; // 'haute' = l'IA applique sans exception

  // Conditions de VISIBILITÉ : la question ne s'affiche que si ces conditions sont vraies
  groupes_conditions?: Array<{
    id: string;
    conditions: Array<{
      id: string;
      source: 'reponse_question'; // Toujours 'reponse_question' pour les workflows
      question_id: string;        // ID de la question dont on vérifie la réponse
      operateur: 'egal' | 'different' | 'contient' | 'ne_contient_pas' | 'vide' | 'non_vide';
      valeur?: string;            // Valeur attendue
    }>;
    logique_groupe?: 'ET' | 'OU'; // Logique entre conditions dans le groupe
  }>;
  logique_declencheur?: 'ET' | 'OU'; // Logique entre groupes de conditions

  // Conséquences : actions déclenchées quand l'utilisateur répond
  consequences: Array<{
    type: 'renseigner_variable' | 'afficher_question' | 'masquer_question' | 'aller_question';
    variable_cible?: string;  // Pour 'renseigner_variable' : nom de variable ex: "pto_type"
    question_id?: string;     // Pour navigation : ID de la question cible
  }>;
}
\`\`\`

## Combinaisons source ↔ affichage VALIDES (respecter strictement)
- source "catalogue" → boutons_choix_unique | boutons_choix_multiple | liste_deroulante
- source "sa" → oui_non | confirmation_sa | edition_sa
- source "aucune" → oui_non | texte_court | texte_long | nombre | date | choix_liste_manuelle | adresse_complete
- source "catalogue_et_sa" → boutons_choix_unique | boutons_choix_multiple | confirmation_sa

NE JAMAIS utiliser boutons_choix_unique ou boutons_choix_multiple avec source "aucune" ou "sa".

## Règles importantes
- Les IDs de questions doivent être descriptifs : "q_pto_type", "q_fibre_pto1", "q_fas", etc.
- Pour les questions conditionnelles, utilise groupes_conditions avec source: 'reponse_question'
- Pour les choix fixes (FTTH/SDSL, Simple/Double, Oui/Non/En cours...) → source: 'aucune' + affichage: 'choix_liste_manuelle' + options_manuelles: ["option1", "option2", ...]
- Pour choisir dans le catalogue produits → source: 'catalogue' + affichage: 'boutons_choix_unique' (sans options_manuelles, les options viennent du catalogue)
- Pour Oui/Non simple → affichage: 'oui_non' (source 'aucune' ou 'sa')
- Les branches conditionnelles doivent être pilotées via groupes_conditions
- N'utilise 'afficher_question' ou 'masquer_question' que pour un affichage forcé non conditionnel
- La variable_cible dans 'renseigner_variable' est en snake_case sans accents
- Le champ "consequences" est OBLIGATOIRE sur chaque question. S'il n'y a aucune conséquence, mettre un tableau vide : "consequences": []
- Quand affichage est 'choix_liste_manuelle', le champ options_manuelles est OBLIGATOIRE et doit contenir au moins 2 options

## Format de réponse

### Si tu as besoin de précisions :
Réponds en texte naturel avec tes questions numérotées. Sois bref et précis.

### Si tu génères le workflow :
Réponds UNIQUEMENT avec un bloc JSON valide (sans markdown), sous cette forme exacte :
{"questions": [ ...tableau de SpQuestion... ]}

Ne mets aucun texte avant ou après le JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, templateId, existingQuestions = [], spVariables = [] } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      templateId: string;
      existingQuestions?: Array<Record<string, unknown>>;
      spVariables?: Array<{ key: string; label: string; group: string }>;
    };

    if (!messages?.length) {
      return NextResponse.json({ error: 'Messages requis' }, { status: 400 });
    }

    // Build system prompt — inject variables + existing questions as context
    let systemPrompt = SYSTEM_PROMPT;

    // Inject variables context
    if (spVariables.length > 0) {
      systemPrompt += `\n\n## Variables SP disponibles pour ce template\n${spVariables.map((v) => `- ${v.key}${v.group === 'custom' ? ` (custom — ${v.label})` : ' (standard)'}`).join('\n')}\n\nRègles variables :\n- Utilise les variables existantes quand c'est pertinent (type 'renseigner_variable' dans consequences)\n- Si aucune variable existante ne convient, crée-en avec un nom en sp_snake_case\n- Quand tu crées une NOUVELLE variable, génère TOUJOURS une description utile (1-2 phrases) qui sera stockée avec la variable pour aider l'utilisateur et l'IA\n- Chaque question qui alimente une donnée du document Word DOIT avoir une consequence 'renseigner_variable'`;
    }

    if (existingQuestions.length > 0) {
      const existingSummary = existingQuestions
        .sort((a, b) => ((a.ordre as number) ?? 0) - ((b.ordre as number) ?? 0))
        .map((q, i) => {
          const opts = Array.isArray(q.options_manuelles) && q.options_manuelles.length > 0
            ? ` [options: ${(q.options_manuelles as string[]).join(', ')}]`
            : '';
          const cond = Array.isArray(q.groupes_conditions) && q.groupes_conditions.length > 0
            ? ' [conditionnel]'
            : '';
          return `${i + 1}. id="${q.id}" — "${q.libelle}" (${q.affichage}${opts}${cond})`;
        })
        .join('\n');

      systemPrompt += `\n\n## Workflow actuel du template (${existingQuestions.length} questions)\n${existingSummary}\n\n## Instructions pour la modification\n- Retourne le workflow COMPLET mis à jour (toutes les questions, modifiées ou non)\n- Conserve les IDs existants pour les questions non modifiées\n- Génère de nouveaux IDs descriptifs pour les nouvelles questions\n- L'ORDRE des questions dans le tableau JSON = leur ordre d'affichage (le champ "ordre" sera ignoré et réassigné automatiquement)\n- RESPECTE STRICTEMENT les instructions de positionnement : "à la fin" = dernière position du tableau, "après la question X" = juste après X dans le tableau, "au début" = première position\n- Retourne uniquement le JSON final complet, sans texte avant ou après`;
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages,
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Try to extract JSON — handles plain JSON, ```json blocks, ``` blocks, or JSON embedded in text
    const jsonCandidate =
      raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim() ??
      (raw.startsWith('{') || raw.startsWith('[') ? raw : null) ??
      raw.match(/(\{[\s\S]*\})/)?.[1]?.trim() ??
      null;

    if (jsonCandidate) {
      try {
        const parsed = JSON.parse(jsonCandidate) as { questions: unknown[] };
        const questions = parsed.questions ?? [];

        const withTemplateId = (questions as Array<Record<string, unknown>>).map((q) => ({
          ...q,
          template_id: templateId,
          actif: true,
        }));

        return NextResponse.json({ type: 'result', questions: withTemplateId });
      } catch {
        // JSON parse failed — fall through to return as message
      }
    }

    return NextResponse.json({ type: 'message', content: raw });
  } catch (err) {
    console.error('Erreur génération SP questions:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
