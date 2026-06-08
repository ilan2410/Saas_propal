import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `Tu es un assistant expert qui aide à configurer une seule question SP (Situation Proposée) dans un outil télécom B2B.

## Ton rôle
Tu aides l'utilisateur à remplir les champs d'une question SP. Tu peux :
- Répondre à des questions sur les champs disponibles
- Suggérer des valeurs pour les champs en fonction de ce que l'utilisateur décrit
- Corriger ou améliorer un libellé, une description, des options
- SUGGÉRER quelle variable SP serait la plus adaptée à la question

## Champs d'une question SP
- **libelle** : texte affiché à l'utilisateur (clair, actionnable)
- **description** : aide optionnelle affichée sous la question
- **source** : "aucune" (saisie libre) | "catalogue" (choix depuis catalogue produits)
- **affichage** :
  - Pour source "aucune" : oui_non | texte_court | texte_long | nombre | date | choix_liste_manuelle | adresse_complete
  - Pour source "catalogue" : boutons_choix_unique | boutons_choix_multiple | liste_deroulante
- **options_manuelles** : tableau de strings (requis si affichage = "choix_liste_manuelle")
- **options_libres** : true si une question catalogue autorise une saisie hors-catalogue
- **filtres_catalogue** : filtre par categories, fournisseurs, type_facturation, produits_ids, depuis_reponse_question, groupes/logique_racine
- **groupes_conditions** et **logique_declencheur** : conditions de visibilité sur réponse précédente, SA ou catalogue
- **validation_format** : aucune | email | telephone | siret
- **valeur_defaut** : valeur préremplie
- **obligatoire** : true | false
- **priorite_ia** : "normale" | "haute" (haute = l'IA doit l'appliquer sans exception)
- **consequences** : actions déclenchées à la réponse (renseigner_variable, afficher_question, masquer_question, aller_question, filtrer_question)
- **groupe_boucle_id** et **boucle** : répétition d'un bloc de questions par nombre fixe, réponse d'une question, labels ou tableau SA

## Variables SP
La réponse à une question peut alimenter une variable SP qui sera insérée dans le document Word final.
- Les variables existantes sont listées dans le contexte ci-dessous
- Si une variable existante est compatible avec la question → suggère-la dans ton explication
- Si aucune variable ne correspond → suggère la CRÉATION d'une nouvelle variable avec un nom en snake_case préfixé par "sp_" (ex: sp_type_fibre, sp_offre_tv, sp_nb_postes)
- IMPORTANT : Quand tu suggères une NOUVELLE variable, inclut TOUJOURS une description utile (1-2 phrases) expliquant ce que cette variable contient, pour aider l'utilisateur et l'IA
- Mentionne toujours ta suggestion de variable dans ton explication, comme : "Variable suggérée : sp_xxx (existante)" ou "Variable suggérée : sp_xxx (à créer)"

## Format de réponse

### Si tu conseilles ou expliques (pas de champs à remplir) :
Réponds en texte naturel, court et direct. Inclus ta suggestion de variable si pertinent.

### Si tu proposes des valeurs de champs à appliquer directement :
Réponds UNIQUEMENT avec ce JSON (pas de texte avant ni après) :
{
  "patch": {
    "libelle": "...",
    "description": "...",
    "source": "...",
    "affichage": "...",
    "options_manuelles": [...],
    "options_libres": true,
    "filtres_catalogue": {...},
    "groupes_conditions": [...],
    "logique_declencheur": "ET",
    "validation_format": "aucune",
    "valeur_defaut": "...",
    "edition_type": "texte",
    "consequences": [...],
    "obligatoire": true,
    "priorite_ia": "normale",
    "groupe_boucle_id": "boucle_sites",
    "boucle": {...}
  },
  "variable_suggestion": {
    "key": "sp_xxx",
    "exists": true,
    "label": "Libellé explicatif",
    "description": "Description courte (1-2 phrases) expliquant ce que contient cette variable"
  },
  "explanation": "Explication courte + suggestion de variable (1-2 phrases)"
}

N'inclus dans "patch" QUE les champs que tu veux modifier. Omet les champs que tu ne changes pas.
Respecte strictement les combinaisons source/affichage et préfère les conditions de visibilité aux conséquences afficher/masquer pour les branches simples.
Le champ "variable_suggestion" est OPTIONNEL — n'inclus le que si la question devrait alimenter une variable.
Si l'utilisateur demande juste un conseil sans vouloir appliquer, réponds en texte.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, currentQuestion, otherQuestions = [], spVariables = [] } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      currentQuestion: Record<string, unknown>;
      otherQuestions: Array<{ id: string; libelle: string }>;
      spVariables?: Array<{ key: string; label: string; group: string }>;
    };

    if (!messages?.length) {
      return NextResponse.json({ error: 'Messages requis' }, { status: 400 });
    }

    // Build context about current question state
    const currentState = [
      currentQuestion.libelle ? `- Libellé actuel : "${currentQuestion.libelle}"` : '- Libellé : (vide)',
      currentQuestion.description ? `- Description : "${currentQuestion.description}"` : null,
      `- Source : ${currentQuestion.source ?? 'non définie'}`,
      `- Affichage : ${currentQuestion.affichage ?? 'non défini'}`,
      Array.isArray(currentQuestion.options_manuelles) && currentQuestion.options_manuelles.length > 0
        ? `- Options : ${(currentQuestion.options_manuelles as string[]).join(', ')}`
        : null,
      `- Obligatoire : ${currentQuestion.obligatoire ? 'oui' : 'non'}`,
      `- Priorité IA : ${currentQuestion.priorite_ia ?? 'normale'}`,
    ].filter(Boolean).join('\n');

    const otherContext = otherQuestions.length > 0
      ? `\nAutres questions du template (pour références) :\n${otherQuestions.map((q, i) => `${i + 1}. "${q.libelle}" (id: ${q.id})`).join('\n')}`
      : '';

    const varsContext = spVariables.length > 0
      ? `\n\n## Variables SP disponibles pour ce template\n${spVariables.map((v) => `- ${v.key}${v.group === 'custom' ? ` (custom — ${v.label})` : ' (standard)'}`).join('\n')}`
      : '\n\n## Variables SP disponibles\nAucune variable custom définie. Variables standard : sp_economie_mensuelle, sp_economie_annuelle, sp_total_actuel, sp_total_propose, sp_ameliorations, sp_fournisseur_propose, sp_nb_lignes, sp_est_economie';

    const systemWithContext = `${SYSTEM_PROMPT}\n\n## État actuel de la question en cours d'édition\n${currentState}${otherContext}${varsContext}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemWithContext,
      messages,
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Try to extract a JSON patch
    const jsonCandidate =
      raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim() ??
      (raw.startsWith('{') ? raw : null);

    if (jsonCandidate) {
      try {
        const parsed = JSON.parse(jsonCandidate) as {
          patch: Record<string, unknown>;
          explanation: string;
          variable_suggestion?: { key: string; exists: boolean; label: string };
        };
        if (parsed.patch) {
          return NextResponse.json({
            type: 'patch',
            patch: parsed.patch,
            explanation: parsed.explanation ?? '',
            ...(parsed.variable_suggestion ? { variable_suggestion: parsed.variable_suggestion } : {}),
          });
        }
      } catch {
        // fall through
      }
    }

    return NextResponse.json({ type: 'message', content: raw });
  } catch (err) {
    console.error('Erreur assistant SP:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
