import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `Tu es un assistant expert qui aide à configurer une seule question SP (Situation Proposée) dans un outil télécom B2B.

## Ton rôle
Tu aides l'utilisateur à remplir les champs d'une question SP. Tu peux :
- Répondre à des questions sur les champs disponibles
- Suggérer des valeurs pour les champs en fonction de ce que l'utilisateur décrit
- Corriger ou améliorer un libellé, une description, des options

## Champs d'une question SP
- **libelle** : texte affiché à l'utilisateur (clair, actionnable)
- **description** : aide optionnelle affichée sous la question
- **source** : "aucune" (saisie libre) | "catalogue" (choix depuis catalogue produits) | "sa" (données SA extraites) | "catalogue_et_sa"
- **affichage** :
  - Pour source "aucune" : oui_non | texte_court | texte_long | nombre | date | choix_liste_manuelle | adresse_complete
  - Pour source "catalogue" : boutons_choix_unique | boutons_choix_multiple | liste_deroulante
  - Pour source "sa" : oui_non | confirmation_sa | edition_sa
  - Pour source "catalogue_et_sa" : boutons_choix_unique | boutons_choix_multiple | confirmation_sa
- **options_manuelles** : tableau de strings (requis si affichage = "choix_liste_manuelle" ou si source="aucune" avec boutons)
- **obligatoire** : true | false
- **priorite_ia** : "normale" | "haute" (haute = l'IA doit l'appliquer sans exception)
- **consequences** : actions déclenchées à la réponse (renseigner_variable, afficher_question, masquer_question, aller_question)

## Format de réponse

### Si tu conseilles ou expliques (pas de champs à remplir) :
Réponds en texte naturel, court et direct.

### Si tu proposes des valeurs de champs à appliquer directement :
Réponds UNIQUEMENT avec ce JSON (pas de texte avant ni après) :
{
  "patch": {
    "libelle": "...",
    "description": "...",
    "source": "...",
    "affichage": "...",
    "options_manuelles": [...],
    "obligatoire": true,
    "priorite_ia": "normale"
  },
  "explanation": "Explication courte de ce que tu as fait (1-2 phrases)"
}

N'inclus dans "patch" QUE les champs que tu veux modifier. Omet les champs que tu ne changes pas.
Si l'utilisateur demande juste un conseil sans vouloir appliquer, réponds en texte.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, currentQuestion, otherQuestions = [] } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      currentQuestion: Record<string, unknown>;
      otherQuestions: Array<{ id: string; libelle: string }>;
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

    const systemWithContext = `${SYSTEM_PROMPT}\n\n## État actuel de la question en cours d'édition\n${currentState}${otherContext}`;

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
        const parsed = JSON.parse(jsonCandidate) as { patch: Record<string, unknown>; explanation: string };
        if (parsed.patch) {
          return NextResponse.json({ type: 'patch', patch: parsed.patch, explanation: parsed.explanation ?? '' });
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
