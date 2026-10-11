import type { SpAdresse, SpQuestion, SpQuestionReponse } from '@/types';

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

export function findAddressQuestion(questions: SpQuestion[], variable: 'sp_adresse_facturation' | 'sp_adresse_livraison' | 'sp_livraison_identique'): SpQuestion | undefined {
  const configured = questions.find((q) =>
    (variable === 'sp_livraison_identique' || q.affichage === 'adresse_complete') &&
    q.consequences?.some((c) => c.type === 'renseigner_variable' && c.variable_cible === variable));
  if (configured || variable !== 'sp_adresse_facturation') return configured;
  return questions.find((q) => q.affichage === 'adresse_complete' &&
    !q.consequences?.some((c) => c.variable_cible === 'sp_adresse_livraison'));
}

export function isDeliveryIdentical(questions: SpQuestion[], reponses: SpQuestionReponse[]): boolean {
  const question = findAddressQuestion(questions, 'sp_livraison_identique');
  const answer = question && [...reponses].reverse().find((r) => getBaseQuestionId(r.question_id) === question.id);
  return !answer || answer.valeur === true || answer.valeur === 'Oui';
}

export function clientToSpAddress(client: Record<string, unknown>, previous?: SpAdresse): SpAdresse {
  const get = (key: string) => String(client[key] ?? '');
  const nom = get('nom');
  const prenom = get('prenom');
  return {
    ...previous,
    societe: get('raison_sociale'), nom, prenom, fonction: get('fonction'),
    contact: [nom, prenom].filter(Boolean).join(' '),
    email: get('email'), ligne_mobile: get('mobile'), ligne_fixe: get('fixe'),
    adresse: get('adresse'), code_postal: get('code_postal'), ville: get('ville'),
    siret: get('siret') || get('siren'),
  };
}

export function spAddressToClient(data: Record<string, unknown>, address: SpAdresse): Record<string, unknown> {
  const client = data.client && typeof data.client === 'object' && !Array.isArray(data.client)
    ? data.client as Record<string, unknown> : {};
  const existing = (key: string) => typeof client[key] === 'string' ? client[key] : '';
  return {
    ...data,
    client: {
      ...client,
      raison_sociale: address.societe ?? existing('raison_sociale'),
      nom: address.nom ?? existing('nom'), prenom: address.prenom ?? existing('prenom'),
      fonction: address.fonction ?? existing('fonction'), email: address.email ?? existing('email'),
      mobile: address.ligne_mobile ?? existing('mobile'), fixe: address.ligne_fixe ?? existing('fixe'),
      adresse: address.adresse, code_postal: address.code_postal, ville: address.ville,
      siret: address.siret ?? existing('siret'),
    },
  };
}

export function resolveSpAddressPreferences(questions: SpQuestion[], reponses: SpQuestionReponse[]) {
  const getAddress = (variable: 'sp_adresse_facturation' | 'sp_adresse_livraison'): SpAdresse | undefined => {
    const question = findAddressQuestion(questions, variable);
    const answer = question && reponses.find((r) => getBaseQuestionId(r.question_id) === question.id)?.valeur;
    return answer && typeof answer === 'object' && !Array.isArray(answer) ? answer as SpAdresse : undefined;
  };
  const livraisonIdentique = isDeliveryIdentical(questions, reponses);
  return {
    adresse_facturation: getAddress('sp_adresse_facturation'),
    adresse_livraison: livraisonIdentique ? undefined : getAddress('sp_adresse_livraison'),
    livraison_identique: livraisonIdentique,
  };
}

export function syncLinkedAddresses(questions: SpQuestion[], reponses: SpQuestionReponse[], client: Record<string, unknown>): SpQuestionReponse[] {
  const billing = findAddressQuestion(questions, 'sp_adresse_facturation')?.id;
  const delivery = isDeliveryIdentical(questions, reponses)
    ? findAddressQuestion(questions, 'sp_adresse_livraison')?.id : undefined;
  let changed = false;
  const synced = reponses.map((r) => {
    if (getBaseQuestionId(r.question_id) !== billing && getBaseQuestionId(r.question_id) !== delivery) return r;
    if (!r.valeur || typeof r.valeur !== 'object' || Array.isArray(r.valeur)) return r;
    const previous = r.valeur as SpAdresse;
    const next = clientToSpAddress(client, previous);
    if (Object.entries(next).every(([key, value]) => previous[key as keyof SpAdresse] === value)) return r;
    changed = true;
    return { ...r, valeur: next };
  });
  return changed ? synced : reponses;
}
