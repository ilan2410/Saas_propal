import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { generatePropositionFile } from './index';
import { generateExcelPreview } from './excel';
import { buildExcelSourceData, buildPropositionBaseData } from './base-data';
import { buildSpWordData } from './sp-word-data';
import { fillExcelWorkbook } from './excel-workbook';
import { normalizePhoneNumber } from '@/lib/utils/formatting';
import { clientToSpAddress, isDeliveryIdentical, resolveSpAddressPreferences, spAddressToClient, syncLinkedAddresses } from '@/lib/sp/questionVariables';
import type { SpQuestion, SpQuestionReponse } from '@/types';
import { reconcileClientEdit } from '@/components/propositions/FloatingClientCoordonnees';

const upload = vi.fn().mockResolvedValue({ error: null });
const list = vi.fn().mockResolvedValue({ data: [{ name: 'generated.xlsx' }], error: null });
const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.test/generated.xlsx' } });
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ storage: { from: () => ({ upload, list, getPublicUrl }) } }),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('mise à jour du panneau coordonnées client', () => {
  it('reflète la facturation validée sans effacer une saisie en cours', () => {
    const previous = { raison_sociale: 'Acme', nom: 'Dupont', prenom: 'Zoé', fonction: '',
      email: '', mobile: '', fixe: '', adresse: '1 rue A', code_postal: '75001', ville: 'Paris', siret: '' };
    const billing = { ...previous, adresse: '2 rue B', ville: 'Lyon', nom: 'Martin' };
    expect(reconcileClientEdit(previous, previous, billing)).toEqual(billing);
    expect(reconcileClientEdit(previous, { ...previous, email: 'saisie@acme.fr' }, billing))
      .toEqual({ ...billing, email: 'saisie@acme.fr' });
  });
});

describe('synchronisation des coordonnées SP', () => {
  const question = (id: string, target: string): SpQuestion => ({
    id, template_id: 'template', ordre: 1, actif: true, libelle: id, source: 'aucune',
    affichage: id === 'identique' ? 'oui_non' : 'adresse_complete', obligatoire: true,
    consequences: [{ type: 'renseigner_variable', variable_cible: target }], priorite_ia: 'normale',
  });
  const questions = [
    question('facturation', 'sp_adresse_facturation'),
    question('identique', 'sp_livraison_identique'),
    question('livraison', 'sp_adresse_livraison'),
  ];
  const client = { raison_sociale: 'Acme', nom: 'Dupont', prenom: 'Zoé', fonction: 'Achats',
    email: 'contact@acme.fr', mobile: '0611223344', fixe: '0111223344',
    adresse: '1 rue A', code_postal: '75001', ville: 'Paris', siret: '12345678900012' };

  it('transmet en simulation la facturation et une livraison distincte à la génération SP', () => {
    const billing = clientToSpAddress(client);
    const delivery = { ...billing, adresse: 'Entrepôt B', ville: 'Lyon' };
    const answers: SpQuestionReponse[] = [
      { question_id: 'facturation', valeur: billing },
      { question_id: 'identique', valeur: 'Non' },
      { question_id: 'livraison', valeur: delivery },
    ];
    expect(resolveSpAddressPreferences(questions, answers)).toEqual({
      adresse_facturation: billing, adresse_livraison: delivery, livraison_identique: false,
    });
    expect(resolveSpAddressPreferences(questions, [answers[0], { question_id: 'identique', valeur: 'Oui' }, answers[2]]))
      .toEqual({ adresse_facturation: billing, adresse_livraison: undefined, livraison_identique: true });
  });

  it('reconnaît le formulaire de facturation même sans conséquence explicite', () => {
    const withoutConsequence = questions.map((q) => q.id === 'facturation' ? { ...q, consequences: [] } : q);
    const address = clientToSpAddress(client);
    const updated = syncLinkedAddresses(withoutConsequence, [{ question_id: 'facturation', valeur: address }],
      { ...client, adresse: '2 rue B' });
    expect(updated[0].valeur).toMatchObject({ adresse: '2 rue B' });
  });

  it('synchronise client et facturation dans les deux sens, et la livraison seulement si identique', () => {
    const billing = clientToSpAddress(client);
    const replies: SpQuestionReponse[] = [
      { question_id: 'facturation', valeur: billing },
      { question_id: 'identique', valeur: 'Oui' },
      { question_id: 'livraison', valeur: billing },
    ];
    const modified = { ...client, adresse: '2 rue B', nom: 'Martin' };
    const linked = syncLinkedAddresses(questions, replies, modified);
    expect(isDeliveryIdentical(questions, linked)).toBe(true);
    expect(linked[0].valeur).toMatchObject({ adresse: '2 rue B', nom: 'Martin', contact: 'Martin Zoé' });
    expect(linked[2].valeur).toMatchObject({ adresse: '2 rue B', nom: 'Martin' });

    const separate = [linked[0], { question_id: 'identique', valeur: 'Non' },
      { question_id: 'livraison', valeur: { ...billing, adresse: '3 rue C' } }] as SpQuestionReponse[];
    const next = syncLinkedAddresses(questions, separate, { ...modified, adresse: '4 rue D' });
    expect(isDeliveryIdentical(questions, next)).toBe(false);
    expect(next[0].valeur).toMatchObject({ adresse: '4 rue D' });
    expect(next[2].valeur).toMatchObject({ adresse: '3 rue C' });
    const fromBilling = spAddressToClient({ client: modified }, { ...billing, adresse: '5 rue E', nom: 'Leroy' });
    expect(fromBilling.client).toMatchObject({ adresse: '5 rue E', nom: 'Leroy', prenom: 'Zoé' });
    expect(syncLinkedAddresses(questions, separate, fromBilling.client as Record<string, unknown>)[2].valeur)
      .toMatchObject({ adresse: '3 rue C' });
  });
});

describe('generatePropositionFile Excel', () => {
  it('génère et stocke le même rendu SA/SP/entreprise que le moteur d’aperçu', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Offre');
    sheet.getCell('A1').value = 'Réf. {{sp_reference}}';
    sheet.getCell('A2').value = 'Jusqu’au {{sp_date_limite_souscription-15}}';
    const source = await workbook.xlsx.writeBuffer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => source }));
    const url = await generatePropositionFile({
      template: { id: 'excel', file_type: 'excel', file_url: 'https://storage.example.test/template.xlsx', champs_actifs: [],
        file_config: { sheetMappings: [{ sheetName: 'Offre', mapping: { entreprise_nom: 'B1', numero: 'B2', sp_clause_geste: 'B3', prix: 'B4' } }] } },
      donnees: { numero: '0612345678', prix: '12,50 €' },
      organization_id: 'org-1', proposition_id: 'prop-1', proposition_created_at: '2026-09-07T00:00:00Z',
      sp_reference: 'REF-42', sp_clauses_rendered: { sp_clause_geste: 'Offert' }, organization_profile: { nom: 'Entreprise Test' },
    });
    expect(url).toBe('https://example.test/generated.xlsx');
    expect(upload).toHaveBeenCalledOnce();
    const [path, bytes, options] = upload.mock.calls[0];
    expect(path).toMatch(/^generated\/org-1\/Propal_Proposition_\d+\.xlsx$/);
    expect(options.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const filled = result.getWorksheet('Offre')!;
    expect(filled.getCell('A1').value).toBe('Réf. REF-42');
    expect(filled.getCell('A2').value).toBe('Jusqu’au 22/09/2026');
    expect(filled.getCell('B1').value).toBe('Entreprise Test');
    expect(filled.getCell('B2').value).toBe('0612345678');
    expect(filled.getCell('B3').value).toBe('Offert');
    expect(filled.getCell('B4').value).toBe(12.5);
  });
  it('alimente chaque coordonnée client, facturation et livraison dans les cellules Excel', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Offre');
    const source = await workbook.xlsx.writeBuffer();
    const client = {
      raison_sociale: 'Client SA', nom: 'Martin', prenom: 'Alice', fonction: 'Direction',
      email: 'alice@example.fr', mobile: '0612345678', fixe: '0144556677',
      adresse: '1 rue SA', code_postal: '75001', ville: 'Paris', siret: '12345678900012',
    };
    const fields = {
      societe: 'Société SP', nom: 'Dupont', prenom: 'Zoé', fonction: 'Achats',
      adresse: '2 rue SP', code_postal: '69001', ville: 'Lyon',
      contact: 'Dupont Zoé', ligne_fixe: '0477889900', ligne_mobile: '0677889900',
      email: 'zoe@example.fr', siret: '98765432100012',
    };
    const livraison = { ...fields, societe: 'Livraison SP', adresse: '3 rue SP', nom: 'Durand', prenom: 'Luc', contact: 'Durand Luc' };
    const mapping: Record<string, string> = {};
    const expected: Record<string, string> = {};
    const add = (key: string, value: string) => {
      const cell = `A${Object.keys(mapping).length + 1}`;
      mapping[key] = cell;
      expected[cell] = key.startsWith('Adresse_') && /(?:mobile|fixe)$/.test(key) ? normalizePhoneNumber(value) : value;
    };
    for (const [key, value] of Object.entries(client)) add(`client.${key}`, value);
    for (const [prefix, address] of [
      ['Adresse_facturation_SP', fields], ['Adresse_livraison_SP', livraison],
    ] as const) {
      for (const [key, value] of Object.entries(address)) {
        add(`${prefix}_${key === 'code_postal' ? 'cp' : key}`, value);
      }
    }
    const donnees = { client };
    const template = { id: 'excel', file_type: 'excel' as const, file_url: '', champs_actifs: [], file_config: {} };
    const base = buildPropositionBaseData({
      template, donnees, organization_id: 'org', proposition_id: 'prop',
      suggestions_sp_completes: {
        suggestions: [], synthese: { cout_total_actuel: 0, cout_total_propose: 0, economie_mensuelle: 0, economie_annuelle: 0 },
        sp_lignes_mobiles: [], sp_lignes_fixes: [], sp_internet: [], sp_materiel: [],
        sp_economie_mensuelle: '', sp_economie_annuelle: '', sp_total_actuel: '', sp_total_propose: '',
        sp_ameliorations: '', sp_nb_lignes: '', sp_est_economie: '',
        sp_adresse_facturation: fields, sp_adresse_livraison: livraison, sp_livraison_identique: false,
      },
    });
    const bytes = await fillExcelWorkbook(source, donnees, base, { sheetMappings: [{ sheetName: 'Offre', mapping }] });
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof result.xlsx.load>[0]);
    for (const [cell, value] of Object.entries(expected)) {
      expect(String(result.getWorksheet('Offre')!.getCell(cell).value).toLocaleLowerCase('fr-FR')).toBe(value.toLocaleLowerCase('fr-FR'));
    }
    const linkedData = buildSpWordData({
      suggestions: [], synthese: { cout_total_actuel: 0, cout_total_propose: 0, economie_mensuelle: 0, economie_annuelle: 0 },
      sp_lignes_mobiles: [], sp_lignes_fixes: [], sp_internet: [], sp_materiel: [],
      sp_economie_mensuelle: '', sp_economie_annuelle: '', sp_total_actuel: '', sp_total_propose: '',
      sp_ameliorations: '', sp_nb_lignes: '', sp_est_economie: '',
      sp_adresse_facturation: fields, sp_livraison_identique: true,
    });
    for (const key of Object.keys(fields)) {
      const suffix = key === 'code_postal' ? 'cp' : key;
      expect(linkedData[`Adresse_livraison_SP_${suffix}`]).toBe(linkedData[`Adresse_facturation_SP_${suffix}`]);
    }
  });

  it('affiche toutes les coordonnées de la simulation dans l’aperçu Excel, même si la SA stockée est ancienne', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Offre');
    const source = await workbook.xlsx.writeBuffer();
    const stored = { 'client.nom': 'Ancien plat', client: { raison_sociale: 'Ancienne société', nom: 'Ancien',
      adresse: 'Ancienne rue', code_postal: '10000', ville: 'Ancienne ville', email: '', mobile: '' } };
    const updated = { raison_sociale: 'Société récente', nom: 'Martin', prenom: 'Léa', fonction: 'Direction',
      email: 'lea@example.fr', mobile: '0612345678', fixe: '0144556677',
      adresse: '12 rue Nouvelle', code_postal: '75008', ville: 'Paris', siret: '12345678900012' };
    const sp = {
      suggestions: [], synthese: { cout_total_actuel: 0, cout_total_propose: 0, economie_mensuelle: 0, economie_annuelle: 0 },
      sp_lignes_mobiles: [], sp_lignes_fixes: [], sp_internet: [], sp_materiel: [],
      sp_economie_mensuelle: '', sp_economie_annuelle: '', sp_total_actuel: '', sp_total_propose: '',
      sp_ameliorations: '', sp_nb_lignes: '', sp_est_economie: '',
      sp_adresse_facturation: clientToSpAddress(updated),
    };
    const donnees = buildExcelSourceData(stored, sp);
    const template = { id: 'excel', file_type: 'excel' as const, file_url: '', champs_actifs: [], file_config: {} };
    const base = buildPropositionBaseData({ template, donnees, organization_id: 'org', proposition_id: 'prop', suggestions_sp_completes: sp });
    const mapping = Object.fromEntries(Object.keys(updated).map((key, index) => [`client.${key}`, `A${index + 1}`]));
    const bytes = await fillExcelWorkbook(source, donnees, base, { sheetMappings: [{ sheetName: 'Offre', mapping }] });
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof result.xlsx.load>[0]);
    for (const [key, value] of Object.entries(updated)) {
      expect(String(result.getWorksheet('Offre')!.getCell(mapping[`client.${key}`]).value).toLocaleLowerCase('fr-FR').replace(/\s/g, ''))
        .toBe(value.toLocaleLowerCase('fr-FR').replace(/\s/g, ''));
    }
    expect(stored.client.raison_sociale).toBe('Ancienne société');
    expect(stored['client.nom']).toBe('Ancien plat');
    expect((buildExcelSourceData(stored, { ...sp, sp_adresse_facturation: {
      adresse: '12 rue Nouvelle', code_postal: '75008', ville: 'Paris',
    } }).client as Record<string, unknown>).raison_sociale).toBe('Ancienne société');
    expect(buildExcelSourceData(stored, null)).toBe(stored);
  });

  it('conserve les mêmes coordonnées dans le fichier Excel généré après une simulation', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Offre');
    const source = await workbook.xlsx.writeBuffer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => source }));
    await generatePropositionFile({
      template: { id: 'excel', file_type: 'excel', file_url: 'https://storage.example.test/template.xlsx', champs_actifs: [],
        file_config: { sheetMappings: [{ sheetName: 'Offre', mapping: {
          'client.raison_sociale': 'A1', 'client.adresse': 'A2', 'client.code_postal': 'A3', 'client.email': 'A4',
        } }] } },
      donnees: { client: { raison_sociale: 'Ancien client', adresse: 'Ancienne rue', code_postal: '10000' } },
      organization_id: 'org', proposition_id: 'prop',
      suggestions_sp_completes: {
        suggestions: [], synthese: { cout_total_actuel: 0, cout_total_propose: 0, economie_mensuelle: 0, economie_annuelle: 0 },
        sp_lignes_mobiles: [], sp_lignes_fixes: [], sp_internet: [], sp_materiel: [],
        sp_economie_mensuelle: '', sp_economie_annuelle: '', sp_total_actuel: '', sp_total_propose: '',
        sp_ameliorations: '', sp_nb_lignes: '', sp_est_economie: '',
        sp_adresse_facturation: { societe: 'Nouveau client', adresse: 'Nouvelle rue', code_postal: '75008', ville: 'Paris', email: 'client@example.fr' },
      },
    });
    const bytes = upload.mock.calls[0][1];
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const sheet = result.getWorksheet('Offre')!;
    expect(String(sheet.getCell('A1').value).toLocaleLowerCase('fr-FR')).toBe('nouveau client');
    expect(String(sheet.getCell('A2').value).toLocaleLowerCase('fr-FR')).toBe('nouvelle rue');
    expect(sheet.getCell('A3').value).toBe('75008');
    expect(sheet.getCell('A4').value).toBe('client@example.fr');
  });

  it('utilise aussi le moteur commun dans l’ancien aperçu HTML Excel', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Offre').getCell('A1').value = 'Ancien';
    const source = await workbook.xlsx.writeBuffer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => source }));
    const html = await generateExcelPreview('https://storage.example.test/template.xlsx', { numero: '001', nom: '<Client>' }, {
      feuilleCiblee: 'Offre', cellMappings: { A1: 'numero', B1: 'nom' },
    });
    expect(html).toContain('001'); expect(html).toContain('&lt;Client&gt;'); expect(html).not.toContain('Ancien');
  });
});

vi.mock('@/lib/security/storage-access', () => ({ signedOrganizationStorageUrl: async (_client: unknown, url: string) => url }));
