import { describe, expect, it } from 'vitest';
import { formatBdcOperatorNameWithNumber } from './bdcOperator';

describe('formatBdcOperatorNameWithNumber', () => {
  it('concatène le nom et le numéro avec un tiret', () => {
    expect(formatBdcOperatorNameWithNumber('E-STANDARD', '01 23 45 67 89'))
      .toBe('E-STANDARD - 01 23 45 67 89');
  });

  it('conserve le nom inchangé lorsque le numéro est absent', () => {
    expect(formatBdcOperatorNameWithNumber('LICENCE CENTREX', undefined))
      .toBe('LICENCE CENTREX');
    expect(formatBdcOperatorNameWithNumber('FAX PAR MAIL', '   '))
      .toBe('FAX PAR MAIL');
  });
});
