import type { SpQuestionReponse } from '@/types';
import type { CartLine } from './calculateCart';

function readPriceMap(reponses: SpQuestionReponse[], questionId: string): Record<string, string> {
  const raw = reponses.find((r) => r.question_id === questionId)?.valeur;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setCartReponseMapValue(
  reponses: SpQuestionReponse[],
  questionId: string,
  key: string,
  value: number,
): SpQuestionReponse[] {
  const existing = reponses.find((r) => r.question_id === questionId);
  const currentMap = readPriceMap(reponses, questionId);
  const newValeur = JSON.stringify({ ...currentMap, [key]: String(value) });
  if (existing) {
    return reponses.map((r) => (r.question_id === questionId ? { ...r, valeur: newValeur } : r));
  }
  return [...reponses, { question_id: questionId, valeur: newValeur }];
}

export function updateCartLinePriceOrQuantity(
  reponses: SpQuestionReponse[],
  line: CartLine,
  field: 'prix' | 'quantite',
  value: number,
): SpQuestionReponse[] {
  const key = line.produitId ?? line.produitNom;
  const baseId = `prix_${line.instanceId}`;
  const finalId = `prix_panier_${line.instanceId}`;
  const finalMap = readPriceMap(reponses, finalId);
  const hasFinalOverride = key in finalMap || line.produitNom in finalMap;

  if (field === 'prix') {
    // A discounted line needs its own final price: editing the base price would
    // be immediately overwritten by the operator discount.
    const questionId = line.prixOriginalTotal != null || hasFinalOverride ? finalId : baseId;
    return setCartReponseMapValue(reponses, questionId, key, value);
  }

  const oldQty = line.quantite > 0 ? line.quantite : 1;
  let updated = setCartReponseMapValue(reponses, `quantite_${line.instanceId}`, line.produitNom, value);
  const baseMap = readPriceMap(reponses, baseId);
  const basePrice = Number(baseMap[key] ?? baseMap[line.produitNom]);
  if (Number.isFinite(basePrice) && (key in baseMap || line.produitNom in baseMap)) {
    updated = setCartReponseMapValue(updated, baseId, key, basePrice / oldQty * value);
  }
  if (hasFinalOverride) {
    const finalPrice = Number(finalMap[key] ?? finalMap[line.produitNom]);
    if (Number.isFinite(finalPrice)) {
      updated = setCartReponseMapValue(updated, finalId, key, finalPrice / oldQty * value);
    }
  }
  return updated;
}
