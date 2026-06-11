import type {
  SpObjectifConfig,
  SpQuestionReponse,
  SuggestionsSpCompletes,
  CatalogueProduit,
} from '@/types';
import { evaluateGroupes } from './evaluateConditions';

export interface ResolvedObjectif {
  config: SpObjectifConfig;
  textes: string[];
}

function isObjectifTriggered(
  config: SpObjectifConfig,
  reponses: SpQuestionReponse[],
): boolean {
  if (!config.question_id) return true;
  return reponses.some((r) => r.question_id === config.question_id);
}

export function interpolateObjectifTexte(
  texte: string,
  sp: SuggestionsSpCompletes | null,
  reponses: SpQuestionReponse[],
): string {
  return texte.replace(/\{\{([^}]+)\}\}/g, (_, token: string) => {
    const trimmed = token.trim();

    if (trimmed.startsWith('suggestions.')) {
      const key = trimmed.slice('suggestions.'.length) as keyof SuggestionsSpCompletes;
      const val = sp?.[key];
      return val != null ? String(val) : '';
    }

    if (trimmed.startsWith('reponse.')) {
      const questionId = trimmed.slice('reponse.'.length);
      const rep = reponses.find((r) => r.question_id === questionId);
      if (!rep) return '';
      if (Array.isArray(rep.valeur)) return rep.valeur.join(', ');
      return rep.valeur != null ? String(rep.valeur) : '';
    }

    return '';
  });
}

export function evaluateObjectifsForRender(
  config: SpObjectifConfig[],
  templateId: string,
  reponses: SpQuestionReponse[],
  sp: SuggestionsSpCompletes | null,
  catalogue?: CatalogueProduit[],
): ResolvedObjectif[] {
  const donneesExtraites: Record<string, unknown> = {};

  const actifs = config
    .filter((o) => o.actif && o.template_id === templateId)
    .sort((a, b) => a.ordre - b.ordre);

  const resolved: ResolvedObjectif[] = [];

  for (const objectif of actifs) {
    if (!isObjectifTriggered(objectif, reponses)) continue;

    const messagesSorted = [...objectif.messages].sort((a, b) => a.ordre - b.ordre);
    const matchingTextes: string[] = [];

    for (const message of messagesSorted) {
      if (!message.groupes_conditions || message.groupes_conditions.length === 0) {
        matchingTextes.push(interpolateObjectifTexte(message.texte, sp, reponses));
      } else {
        const match = evaluateGroupes(
          message.groupes_conditions,
          message.logique_conditions ?? 'ET',
          reponses,
          donneesExtraites,
          sp,
          catalogue,
        );
        if (match) {
          matchingTextes.push(interpolateObjectifTexte(message.texte, sp, reponses));
        }
      }
    }

    if (matchingTextes.length === 0) continue;

    resolved.push({
      config: objectif,
      textes: matchingTextes.filter(Boolean),
    });
  }

  return resolved;
}
