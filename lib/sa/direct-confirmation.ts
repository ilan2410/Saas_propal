import { z } from 'zod';
import { applySaEdit, type SaEditOp } from '@/lib/sp/saCartEdit';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { estimateResiliationFromSA, replaceIndemnitesSectionInResume } from '@/lib/sp/resiliation';
import type { SpConfigResiliation } from '@/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSaConfirmed(data: unknown): boolean {
  return isRecord(data) && isRecord(data._sa_confirmation)
    && typeof data._sa_confirmation.confirmed_at === 'string';
}

export function requiresSaConfirmation(data: unknown): boolean {
  return isRecord(data) && data._sa_confirmation_required === true && !isSaConfirmed(data);
}

const price = z.number().finite().min(0).max(1e9);
const quantity = z.number().int().min(1).max(1e6);
const linePatch = z.object({
  designation: z.string().max(2000).optional(), numero: z.string().max(100).optional(),
  quantite: quantity.optional(), montant: price.optional(),
}).strict();
export const SaOperationsSchema = z.array(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('update'), id: z.string().max(100), patch: linePatch }).strict(),
  z.object({ kind: z.literal('delete'), id: z.string().max(100) }).strict(),
  z.object({ kind: z.literal('add'), input: z.object({
    section: z.enum(['abonnement', 'location', 'variable']),
    type: z.enum(['fixe', 'mobile', 'internet']).optional(),
    designation: z.string().max(2000), numero: z.string().max(100).optional(),
    quantite: quantity, montant: price,
  }).strict() }).strict(),
])).max(1000);

/** Same calculation for the live preview and the authoritative server save. */
export function buildEditedSaData(
  base: Record<string, unknown>, operations: SaEditOp[],
  config?: SpConfigResiliation, referenceDate?: string | null,
): Record<string, unknown> {
  if (!operations.length) return { ...base };
  let sa = isRecord(base.situation_actuelle) ? base.situation_actuelle : {};
  for (const op of operations) sa = applySaEdit(sa, op);
  const result: Record<string, unknown> = { ...base, situation_actuelle: sa };
  const context = isRecord(base._sa_edit_context) ? base._sa_edit_context : {};
  const estimation = estimateResiliationFromSA(result,
    config ?? context.resiliation_config as SpConfigResiliation | undefined,
    referenceDate ?? (typeof context.reference_date === 'string' ? context.reference_date : null));
  sa.indemnites = {
    ...(isRecord(sa.indemnites) ? sa.indemnites : {}),
    montant_source: estimation.montant_source, montant_estime: estimation.montant_estime,
    montant_calcule: estimation.montant_retenu, mois_restants_source: estimation.mois_restants,
    base_mensuelle_source: estimation.base_mensuelle, preavis_mois_source: estimation.preavis_mois,
    frais_resiliation_fixes: estimation.frais_resiliation_fixes, penalites: estimation.penalites,
    frais_materiel: estimation.frais_materiel, services_annexes: estimation.services_annexes,
    mensualites_restantes: estimation.mensualites_restantes, source_retenue: estimation.source_retenue,
    fiabilite: estimation.fiabilite, details_calcul: estimation.details,
    motifs_manquants: estimation.motifs_manquants, methode_calcul: estimation.methode_calcul,
  };
  const indemnity = estimation.montant_retenu ?? estimation.montant_source ?? estimation.montant_estime;
  if (indemnity !== null) sa.ligne_bon_commande_materiel = {
    libelle: `Remboursement de ${indemnity.toFixed(2)} € au titre du solde définitif de vos contrats téléphoniques.`,
    montant: indemnity,
  };
  const summary = calculateSaCartSummary(result);
  result._extraction_control = {
    ...(isRecord(base._extraction_control) ? base._extraction_control : {}),
    status: 'valid_manual', total_ht_mensuel_client: summary.totalMensuel, manual_override: null,
  };
  // Never leave the source-document prose displaying the previous prices.
  result.resume = replaceIndemnitesSectionInResume([
    '**Situation actuelle corrigée**',
    ...summary.details.map(line => `- ${line.libelle} : ${line.montant.toFixed(2)} € HT/mois`),
    `**Total mensuel : ${summary.totalMensuel.toFixed(2)} € HT/mois**`,
  ].join('\n\n'), estimation);
  // Some templates store dotted aliases alongside the nested SA.
  for (const key of Object.keys(base).filter(key => key.startsWith('situation_actuelle.'))) {
    let value: unknown = sa;
    for (const part of key.split('.').slice(1)) value = isRecord(value) ? value[part] : undefined;
    (result as Record<string, unknown>)[key] = value ?? null;
  }
  for (const key of ['lignes', 'abonnements', 'locations', 'charges_variables',
    'total_ht_mensuel_client', 'total_loyer_mensuel', 'total_abonnements', 'total_materiel']) {
    if (key in base) result[key] = sa[key];
  }
  if ('résumé' in base) result['résumé'] = result.resume;
  return result;
}
