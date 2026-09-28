import { describe, expect, it } from 'vitest';
import { DEFAULT_USD_TO_EUR_RATE, parseUsdToEurRate, usdToEur } from './currency';

describe('parseUsdToEurRate', () => {
  it('accepte un nombre et une chaîne numérique', () => {
    expect(parseUsdToEurRate(0.87)).toBeCloseTo(0.87, 10);
    expect(parseUsdToEurRate('0.87')).toBeCloseTo(0.87, 10);
  });

  it('retombe sur le taux par défaut pour une valeur absente, vide ou illisible', () => {
    // Sinon tous les montants en euros s'afficheraient à 0,00 € ou NaN €.
    expect(parseUsdToEurRate(undefined)).toBe(DEFAULT_USD_TO_EUR_RATE);
    expect(parseUsdToEurRate(null)).toBe(DEFAULT_USD_TO_EUR_RATE);
    expect(parseUsdToEurRate('')).toBe(DEFAULT_USD_TO_EUR_RATE);
    expect(parseUsdToEurRate('abc')).toBe(DEFAULT_USD_TO_EUR_RATE);
    expect(parseUsdToEurRate({})).toBe(DEFAULT_USD_TO_EUR_RATE);
  });

  it('retombe sur le taux par défaut pour un taux nul ou négatif', () => {
    expect(parseUsdToEurRate(0)).toBe(DEFAULT_USD_TO_EUR_RATE);
    expect(parseUsdToEurRate(-1)).toBe(DEFAULT_USD_TO_EUR_RATE);
  });
});

describe('usdToEur', () => {
  it('convertit au taux fourni', () => {
    expect(usdToEur(10, 0.9)).toBeCloseTo(9, 10);
  });

  it('rend 0 pour un montant illisible', () => {
    expect(usdToEur(Number.NaN, 0.9)).toBe(0);
  });
});
