import type { SpLibelleKey, SpLibellesConfig, SpModeTotalMensuel } from '@/types';
import { isLibelleVisible, resolveLibelle } from './libelles';

export interface SpResumeBreakdownRow {
  key: SpLibelleKey;
  label: string;
  value: number;
  detail?: boolean;
  section?: 'loyer';
}

type BreakdownValues = Partial<Record<
  'total_mensuel' | 'fixe' | 'mobile' | 'internet' | 'autres_mensuels'
  | 'materiel' | 'installations' | 'fas' | 'cadeaux' | 'autres_ponctuels' | 'total_ponctuel'
  | 'loyer_total_ponctuel' | 'remise_mois_offert' | 'indemnites' | 'marge'
  | 'montant_annee_lissee' | 'base_loyer' | 'loyer_trimestriel' | 'montant_finance',
  number
>>;

export function buildSpResumeBreakdown(
  values: BreakdownValues,
  loyerMensuel: number | null,
  modeTotalMensuel: SpModeTotalMensuel | undefined,
  libelles?: SpLibellesConfig,
): SpResumeBreakdownRow[] {
  const rows: SpResumeBreakdownRow[] = [];
  const add = (
    key: SpLibelleKey,
    value: number | undefined,
    options: { detail?: boolean; section?: 'loyer'; defaultLabel?: string; allowZero?: boolean } = {},
  ) => {
    if (value == null || !Number.isFinite(value) || (value === 0 && !options.allowZero) || !isLibelleVisible(libelles, key)) return;
    rows.push({
      key,
      label: libelles?.[key]?.label?.trim() || options.defaultLabel || resolveLibelle(libelles, key),
      value,
      ...(options.detail ? { detail: true } : {}),
      ...(options.section ? { section: options.section } : {}),
    });
  };

  add('total_mensuel', values.total_mensuel, { defaultLabel: 'Abonnements', allowZero: true });
  add('fixe', values.fixe, { detail: true });
  add('mobile', values.mobile, { detail: true });
  add('internet', values.internet, { detail: true });
  add('autres_mensuels', values.autres_mensuels, { detail: true });
  add('materiel', values.materiel);
  add('installations', values.installations);
  add('fas', values.fas);
  add('cadeaux', values.cadeaux);
  add('autres_ponctuels', values.autres_ponctuels);
  add('total_ponctuel', values.total_ponctuel);

  const loyerSection = { section: 'loyer' as const };
  add('loyer_total_ponctuel', values.loyer_total_ponctuel, { ...loyerSection, allowZero: true });
  add('remise_mois_offert', values.remise_mois_offert, loyerSection);
  add('indemnites', values.indemnites, loyerSection);
  add('marge', values.marge, { ...loyerSection, allowZero: true });
  add('montant_annee_lissee', values.montant_annee_lissee, { ...loyerSection, allowZero: true });
  add('base_loyer', values.base_loyer, { ...loyerSection, allowZero: true });
  add('loyer_mensuel', loyerMensuel ?? undefined, {
    ...loyerSection, defaultLabel: modeTotalMensuel === 'separe' ? 'Loyer matériel' : undefined, allowZero: true,
  });
  add('loyer_trimestriel', values.loyer_trimestriel, { ...loyerSection, allowZero: true });
  add('montant_finance', values.montant_finance, { ...loyerSection, allowZero: true });
  return rows;
}
