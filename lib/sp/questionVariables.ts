import type { SpQuestion, SpQuestionReponse } from '@/types';

export type SpQuestionVariableValues = Record<string, SpQuestionReponse['valeur']>;

function getBaseQuestionId(questionId: string): string {
  return questionId.replace(/__iter_\d+$/, '');
}

export function collectQuestionVariableValues(
  questions: SpQuestion[],
  reponses: SpQuestionReponse[],
): SpQuestionVariableValues {
  const questionsById = new Map<string, SpQuestion>();
  questions.forEach((question) => {
    questionsById.set(question.id, question);
  });

  const variables: SpQuestionVariableValues = {};

  for (const reponse of reponses) {
    const question = questionsById.get(getBaseQuestionId(reponse.question_id));
    if (!question) continue;

    for (const consequence of question.consequences ?? []) {
      if (consequence.type !== 'renseigner_variable' || !consequence.variable_cible) continue;
      variables[consequence.variable_cible] = reponse.valeur;
    }
  }

  return variables;
}
