/**
 * Conversion USD -> EUR pour l'affichage des coûts IA.
 *
 * Les coûts sont STOCKÉS en USD (c'est la devise de facturation Anthropic) ;
 * les euros ne sont qu'une aide à la lecture, recalculée à chaque affichage
 * depuis `platform_settings.usd_to_eur_rate`.
 */

export const DEFAULT_USD_TO_EUR_RATE = 0.92;

/** Un réglage absent, vide ou illisible retombe sur le taux par défaut. */
export function parseUsdToEurRate(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return DEFAULT_USD_TO_EUR_RATE;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_USD_TO_EUR_RATE;
  return parsed;
}

/** Format monetaire USD unique a toute l'application admin. */
export function formatUsd(amountUsd: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amountUsd) ? amountUsd : 0);
}

export function usdToEur(amountUsd: number, rate: number): number {
  if (!Number.isFinite(amountUsd)) return 0;
  return amountUsd * rate;
}
