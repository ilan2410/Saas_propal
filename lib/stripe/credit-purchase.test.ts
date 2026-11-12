import { describe, expect, it } from 'vitest';
import { creditPurchase } from './credit-purchase';

describe('credit purchase monetary boundary', () => {
  it.each(['100', null, true, {}, [], NaN, Infinity, -10, 9.99, 10000.01, 10.001])('rejects invalid input %j', (value) => {
    expect(creditPurchase(value)).toBeNull();
  });
  it.each([[10, 1000, 10], [99.99, 9999, 99.99], [100, 10000, 105], [250, 25000, 275], [500, 50000, 575], [1000, 100000, 1200], [10000, 1000000, 12000]])('prices %s euros consistently', (amount, cents, credits) => {
    expect(creditPurchase(amount)).toMatchObject({ amount, cents, credits });
  });
});
