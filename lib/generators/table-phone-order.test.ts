import { describe, expect, it } from 'vitest';
import { hasTablePhoneNumber, orderTablePhoneRows, phoneRowsFirst } from './table-phone-order';

describe('priorité des lignes contenant un numéro', () => {
  it('déplace les lignes entières sans perdre les lignes sans numéro ni modifier la source', () => {
    const rows = [
      { designation: 'Option', numero: '', prix: 12 },
      { designation: 'Mobile', numero_ligne: '06 00 22 55 66', prix: 13.83 },
      { designation: 'Remise', numero: '   ', prix: -20 },
      { designation: 'Fixe', sp_sp_numero: '01 55 66 22 55', prix: 4.55 },
      { designation: 'Service', prix: 1.77 },
    ];
    expect(phoneRowsFirst(rows, true)).toEqual([rows[1], rows[3], rows[0], rows[2], rows[4]]);
    expect(rows[0].designation).toBe('Option');
    expect(phoneRowsFirst(rows, false)).toBe(rows);
  });
  it.each(['numero', 'numero_ligne', 'sa_numero', 'sp_numero', 'sp_sp_numero', 'telephone'])(
    'reconnaît le champ %s et les numéros internationaux', key => {
      expect(hasTablePhoneNumber({ [key]: '+33 (0)6 00 22 55 66' })).toBe(true);
    },
  );
  it('ne traite pas les références, numéros de série ou champs vides comme des téléphones', () => {
    expect(hasTablePhoneNumber({ numero_serie: '1234567890', reference_contrat: '1234567890' })).toBe(false);
    expect(hasTablePhoneNumber({ numero: 'Non renseigné' })).toBe(false);
    expect(hasTablePhoneNumber({ numero: null })).toBe(false);
  });
  it('fonctionne sur les tableaux SA et SP imbriqués et conserve les autres valeurs', () => {
    const source = { situation_actuelle: { lignes: [{ numero: '', prix: 10 }, { numero: '0600225566', prix: 20 }] },
      sp_table: [{ sp_numero: '' }, { sp_numero: '0155662255' }], client: { nom: 'Acme' } };
    expect(orderTablePhoneRows(source, false)).toBe(source);
    const result = orderTablePhoneRows(source, true);
    expect((result.situation_actuelle as typeof source.situation_actuelle).lignes[0].prix).toBe(20);
    expect((result.sp_table as typeof source.sp_table)[0].sp_numero).toBe('0155662255');
    expect(result.client).toEqual(source.client);
    expect(source.situation_actuelle.lignes[0].prix).toBe(10);
  });
});
