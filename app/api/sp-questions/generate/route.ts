import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type SpAiWorkflowMode = 'create' | 'modify' | 'append';

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

Ne pose JAMAIS de questions pour des détails que tu peux déduire raisonnablement (labels, ordre, IDs, descriptions simples, variables évidentes).

## Schéma SpQuestion complet

Chaque question doit respecter cette structure JSON :

- id: string descriptif stable, ex: "q_pto_type"
- template_id: "" ou template courant, sera rempli à l'import
- ordre: number, ordre d'affichage
- actif: true
- libelle: string
- description?: string
- source: "catalogue" | "sa" | "aucune" | "catalogue_et_sa"
- affichage: "boutons_choix_unique" | "boutons_choix_multiple" | "liste_deroulante" | "oui_non" | "confirmation_sa" | "edition_sa" | "texte_court" | "texte_long" | "nombre" | "date" | "choix_liste_manuelle" | "adresse_complete"
- options_manuelles?: string[]
- options_libres?: boolean
- nombre_max_resultats?: number
- validation_format?: "aucune" | "email" | "telephone" | "siret"
- valeur_defaut?: string
- edition_type?: "adresse_complete" | "texte" | "nombre" | "date"
- filtres_catalogue?: SpFiltresCatalogue
- groupes_conditions?: SpGroupeConditions[]
- logique_declencheur?: "ET" | "OU"
- obligatoire: boolean
- consequences: SpConsequence[]
- priorite_ia: "normale" | "haute"
- groupe_boucle_id?: string
- boucle?: SpQuestionBoucle

## Combinaisons source ↔ affichage valides
- source "catalogue" → boutons_choix_unique | boutons_choix_multiple | liste_deroulante
- source "sa" → oui_non | confirmation_sa | edition_sa
- source "aucune" → oui_non | texte_court | texte_long | nombre | date | choix_liste_manuelle | adresse_complete
- source "catalogue_et_sa" → boutons_choix_unique | boutons_choix_multiple | confirmation_sa

NE JAMAIS utiliser boutons_choix_unique ou boutons_choix_multiple avec source "aucune" ou "sa".
Pour les choix fixes, utilise source "aucune" + affichage "choix_liste_manuelle" + options_manuelles.

## Conditions de visibilité

Une condition :
{
  "id": "cond_xxx",
  "source": "reponse_question" | "sa" | "catalogue",
  "question_id": "q_xxx",
  "variable_sa": "situation_actuelle.lignes",
  "sous_champ_sa": "type",
  "filtre_catalogue": {...},
  "operateur": "egal" | "different" | "vide" | "non_vide" | "contient" | "ne_contient_pas" | "superieur" | "inferieur" | "plus_de_elements" | "moins_de_elements" | "element_ou",
  "valeur": "..."
}

Règles conditions :
- Pour dépendre d'une réponse précédente : source "reponse_question" + question_id.
- Pour dépendre des données extraites SA : source "sa" + variable_sa, optionnellement sous_champ_sa.
- Pour tester la présence de produits catalogue : source "catalogue" + filtre_catalogue.
- Utilise groupes_conditions pour les branches conditionnelles, avec logique_groupe "ET" ou "OU".
- Utilise logique_declencheur pour combiner plusieurs groupes.

## Filtres catalogue

SpFiltresCatalogue peut contenir :
{
  "categories": ["mobile", "internet", "fixe", "cloud", "equipement", "autre"],
  "fournisseurs": ["Orange", "SFR"],
  "type_facturation": "mensuel" | "unique" | "tous",
  "produits_ids": ["..."],
  "depuis_reponse_question": "q_xxx",
  "groupes": [...],
  "logique_racine": "ET" | "OU"
}

- Pour une question catalogue, mets filtres_catalogue si la question doit proposer seulement certaines catégories/fournisseurs/types.
- Si l'utilisateur peut saisir un hors-catalogue, mets options_libres: true.

## Conséquences

Chaque question doit avoir consequences, même vide.
Types disponibles :
- renseigner_variable: variable_cible requis
- afficher_question: question_id requis
- masquer_question: question_id requis
- aller_question: question_id requis
- filtrer_question: question_id requis + filtre requis

Préfère les conditions de visibilité pour les branches simples. Utilise filtrer_question pour filtrer dynamiquement une question catalogue cible selon une réponse.

## Boucles

Pour répéter un bloc de questions (multi-site, multi-ligne, multi-équipement) :
- Toutes les questions répétées partagent le même groupe_boucle_id.
- Seule la première question du groupe porte l'objet boucle.
- boucle peut définir :
  - nombre_fixe
  - source_nombre_question_id, si une question nombre donne le nombre d'itérations
  - source_labels_question_id, si une réponse donne les labels
  - label_prefix, ex: "Site" ou "Ligne"
  - source_sa_array, ex: "situation_actuelle.lignes"
  - source_sa_label_champ, ex: "numero_ligne"
  - source_sa_filtre_champ et source_sa_filtre_valeur, ex: type = mobile

## Règles importantes
- Les IDs de questions doivent être descriptifs et rester stables.
- Conserve les IDs existants quand une question existante n'est pas remplacée.
- Génère de nouveaux IDs descriptifs pour les nouvelles questions.
- La variable_cible dans renseigner_variable est en snake_case, idéalement préfixée par sp_ pour les variables Word.
- Quand affichage est "choix_liste_manuelle", options_manuelles est obligatoire et doit contenir au moins 2 options.
- Pour source "sa" + affichage "edition_sa", renseigne edition_type si le type attendu est évident.
- Pour email/téléphone/SIRET, renseigne validation_format.

## Format de réponse

### Si tu as besoin de précisions :
Réponds en texte naturel avec tes questions numérotées. Sois bref et précis.

### Si tu génères le workflow ou des questions :
Réponds UNIQUEMENT avec un JSON valide, sans markdown, sous cette forme exacte :
{"questions": [ ...tableau de SpQuestion... ]}

Ne mets aucun texte avant ou après le JSON.`;

function summarizeJson(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildExistingSummary(existingQuestions: Array<Record<string, unknown>>): string {
  return [...existingQuestions]
    .sort((a, b) => ((a.ordre as number) ?? 0) - ((b.ordre as number) ?? 0))
    .map((q, i) => {
      const parts = [
        `${i + 1}. id="${q.id}" — "${q.libelle}"`,
        `source=${q.source}`,
        `affichage=${q.affichage}`,
      ];
      if (Array.isArray(q.options_manuelles) && q.options_manuelles.length > 0) parts.push(`options=${(q.options_manuelles as string[]).join('|')}`);
      if (q.filtres_catalogue) parts.push(`filtres_catalogue=${summarizeJson(q.filtres_catalogue)}`);
      if (Array.isArray(q.groupes_conditions) && q.groupes_conditions.length > 0) parts.push(`conditions=${summarizeJson(q.groupes_conditions)}`);
      if (q.logique_declencheur) parts.push(`logique_declencheur=${q.logique_declencheur}`);
      if (Array.isArray(q.consequences) && q.consequences.length > 0) parts.push(`consequences=${summarizeJson(q.consequences)}`);
      if (q.groupe_boucle_id) parts.push(`groupe_boucle_id=${q.groupe_boucle_id}`);
      if (q.boucle) parts.push(`boucle=${summarizeJson(q.boucle)}`);
      return parts.join(' ; ');
    })
    .join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, templateId, existingQuestions = [], spVariables = [], mode = 'create' } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      templateId: string;
      existingQuestions?: Array<Record<string, unknown>>;
      spVariables?: Array<{ key: string; label: string; group: string }>;
      mode?: SpAiWorkflowMode;
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
      const existingSummary = buildExistingSummary(existingQuestions);

      systemPrompt += `\n\n## Workflow actuel du template (${existingQuestions.length} questions)\n${existingSummary}`;
    }

    if (mode === 'modify') {
      systemPrompt += `\n\n## Mode demandé : MODIFIER LE WORKFLOW EXISTANT\n- Retourne le workflow COMPLET mis à jour (toutes les questions, modifiées ou non)\n- Conserve les IDs existants pour les questions non modifiées\n- Supprime une question uniquement si l'utilisateur le demande explicitement\n- Génère de nouveaux IDs descriptifs pour les nouvelles questions\n- L'ORDRE des questions dans le tableau JSON = leur ordre d'affichage (le champ "ordre" sera réassigné automatiquement)\n- RESPECTE STRICTEMENT les instructions de positionnement : "à la fin" = dernière position du tableau, "après la question X" = juste après X dans le tableau, "au début" = première position\n- Retourne uniquement le JSON final complet, sans texte avant ou après`;
    } else if (mode === 'append') {
      systemPrompt += `\n\n## Mode demandé : AJOUTER DES QUESTIONS AU WORKFLOW EXISTANT\n- Retourne UNIQUEMENT les nouvelles questions à ajouter\n- Ne retourne aucune question existante, sauf si une nouvelle question a besoin de la citer dans question_id\n- Ne modifie pas les IDs ni le contenu des questions existantes\n- Tu peux référencer les IDs existants dans groupes_conditions, consequences.question_id, filtres_catalogue.depuis_reponse_question ou boucle.source_nombre_question_id\n- Place les nouvelles questions dans l'ordre demandé; l'application les ajoutera sans remplacer le workflow existant\n- Si l'utilisateur demande une modification d'une question existante, réponds en texte naturel pour lui indiquer d'utiliser le mode "Modifier workflow IA"\n- Retourne uniquement le JSON des nouvelles questions, sans texte avant ou après`;
    } else {
      systemPrompt += `\n\n## Mode demandé : CRÉER UN WORKFLOW\n- Retourne le workflow complet à créer\n- Génère des IDs descriptifs et stables\n- L'ordre du tableau JSON correspond à l'ordre d'affichage\n- Retourne uniquement le JSON final, sans texte avant ou après`;
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
