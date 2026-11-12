import { expect, it } from 'vitest';
import { generatedFileName } from './file-name';

it('places the variant after the client without any generated identifier', () => {
  expect(generatedFileName('MAZERAND SCHERNO', 'xlsx', undefined, 'Variante 2'))
    .toBe('Propal_MAZERAND_SCHERNO_Variante_2.xlsx');
});

it('names annexes with their own title, the client and the selected variant', () => {
  expect(generatedFileName('MAZERAND SCHERNO', 'docx', 'Contrat maintenance', 'Offre éco'))
    .toBe('Contrat_maintenance_MAZERAND_SCHERNO_Offre_eco.docx');
});

it('keeps the initial offer simple and strips filename separators', () => {
  expect(generatedFileName('Client', 'docx')).toBe('Propal_Client.docx');
  expect(generatedFileName('../Client/Paris', 'xlsx', 'Contrat', 'A/B'))
    .toBe('Contrat_Client_Paris_A_B.xlsx');
});
