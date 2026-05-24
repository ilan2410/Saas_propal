import ExcelJS from 'exceljs';
import type {
  SuggestionsSpCompletes,
  SpBdcOperateurLigne,
  SpBdcMaterielLigne,
  SpBdcInternetLigne,
  SpCadeauLigne,
} from '@/types';

export interface ComparatifSaSpOptions {
  sp: SuggestionsSpCompletes;
  clientName?: string;
  companyName?: string;
  primaryColor?: string;
}

function styleHeader(row: ExcelJS.Row, primaryArgb: string) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: primaryArgb } },
    };
  });
  row.height = 22;
}

function styleTotal(row: ExcelJS.Row, primaryArgb: string) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
}

function styleAlt(row: ExcelJS.Row, i: number) {
  if (i % 2 === 1) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => formatValue(item))
      .filter(Boolean)
      .join(', ');
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${humanizeKey(key)}: ${formatValue(item)}`)
      .filter((item) => !item.endsWith(': '))
      .join(' | ');
  }
  return String(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/^_+/, '')
    .replace(/__/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\bcp\b/i, 'CP')
    .replace(/\bid\b/i, 'ID')
    .replace(/\bht\b/gi, 'HT')
    .replace(/\bttc\b/gi, 'TTC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function pickFirst(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = formatValue(record[key]);
    if (value) return value;
  }
  return '';
}

function formatAddress(address: unknown): string {
  if (!isRecord(address)) return '';
  const parts = [
    formatValue(address.adresse),
    formatValue(address.rue),
    formatValue(address.complement),
    [formatValue(address.code_postal || address.cp), formatValue(address.ville)].filter(Boolean).join(' '),
    formatValue(address.pays),
  ].filter(Boolean);
  return parts.join(', ');
}

function buildSourceDetails(record: Record<string, unknown>, excludedKeys: string[]): string {
  const excluded = new Set(excludedKeys);
  const details = Object.entries(record)
    .filter(([key]) => !excluded.has(key) && !key.startsWith('__'))
    .map(([key, value]) => [humanizeKey(key), formatValue(value)] as const)
    .filter(([, value]) => Boolean(value));
  return details.map(([label, value]) => `${label}: ${value}`).join(' | ');
}

function extractCurrentLineInfo(line: unknown) {
  const record = isRecord(line) ? line : {};
  const type = pickFirst(record, ['type_ligne', 'type', 'categorie', 'category', 'service_type']) || 'Service';
  const nom = pickFirst(record, ['nom_ligne', 'nom', 'numero', 'designation', 'libelle', 'ligne', 'service']) || 'Ligne sans libelle';
  const offre = pickFirst(record, ['produit', 'offre', 'forfait', 'designation_offre', 'abonnement', 'libelle_offre']);
  const fournisseur = pickFirst(record, ['operateur', 'opérateur', 'fournisseur', 'provider', 'carrier']);
  const engagement = pickFirst(record, ['engagement', 'duree_engagement', 'date_fin_engagement', 'fin_engagement']);
  const site = pickFirst(record, ['site', 'adresse', 'ville', 'code_postal', 'cp']);
  const details = buildSourceDetails(record, [
    'type_ligne', 'type', 'categorie', 'category', 'service_type',
    'nom_ligne', 'nom', 'numero', 'designation', 'libelle', 'ligne', 'service',
    'produit', 'offre', 'forfait', 'designation_offre', 'abonnement', 'libelle_offre',
    'operateur', 'opérateur', 'fournisseur', 'provider', 'carrier',
    'engagement', 'duree_engagement', 'date_fin_engagement', 'fin_engagement',
    'site', 'adresse', 'ville', 'code_postal', 'cp',
  ]);
  return { type, nom, offre, fournisseur, engagement, site, details };
}

function columnName(index: number): string {
  let dividend = index;
  let column = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    column = String.fromCharCode(65 + modulo) + column;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return column;
}

function addMergedRow(
  ws: ExcelJS.Worksheet,
  text: string,
  colCount: number,
  customize?: (cell: ExcelJS.Cell, row: ExcelJS.Row) => void,
): ExcelJS.Row {
  const row = ws.addRow(Array(colCount).fill(''));
  ws.mergeCells(`A${row.number}:${columnName(colCount)}${row.number}`);
  const cell = row.getCell(1);
  cell.value = text;
  customize?.(cell, row);
  return row;
}

function addSectionTitle(ws: ExcelJS.Worksheet, title: string, primaryArgb: string, colCount: number): void {
  addMergedRow(ws, title, colCount, (cell, row) => {
    cell.font = { bold: true, size: 13, color: { argb: primaryArgb } };
    cell.alignment = { horizontal: 'left' };
    row.height = 22;
  });
}

function addTextBlock(ws: ExcelJS.Worksheet, title: string, text: string, primaryArgb: string, colCount: number): void {
  addSectionTitle(ws, title, primaryArgb, colCount);
  addMergedRow(ws, text, colCount, (cell, row) => {
    cell.alignment = { wrapText: true, vertical: 'top' };
    row.height = Math.max(48, Math.min(220, text.split('\n').length * 16));
  });
  ws.addRow([]);
}

function addTableSection(
  ws: ExcelJS.Worksheet,
  title: string,
  headers: string[],
  rows: string[][],
  primaryArgb: string,
  totalRow?: string[],
): void {
  addSectionTitle(ws, title, primaryArgb, headers.length);
  const header = ws.addRow(headers);
  styleHeader(header, primaryArgb);
  rows.forEach((values, index) => {
    const row = ws.addRow(values);
    styleAlt(row, index);
    row.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  });
  if (totalRow) {
    const total = ws.addRow(totalRow);
    styleTotal(total, primaryArgb);
  }
  ws.addRow([]);
}

export async function generateComparatifSaSpExcel(options: ComparatifSaSpOptions): Promise<Buffer> {
  const {
    sp,
    clientName = 'Client',
    companyName = 'Organisation',
    primaryColor = '#0D4073',
  } = options;

  const primaryArgb = `FF${primaryColor.replace('#', '').toUpperCase()}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();

  const adresseFacturation = formatAddress(sp.sp_adresse_facturation);
  const adresseLivraison = sp.sp_livraison_identique ? 'Identique a la facturation' : formatAddress(sp.sp_adresse_livraison);
  const allForfaits = [...sp.sp_lignes_mobiles, ...sp.sp_lignes_fixes, ...sp.sp_internet];
  const materielDetail = sp.sp_materiel_detail ?? [];
  const bdcOp = sp.sp_bdc_operateur_table as SpBdcOperateurLigne[] | undefined;
  const bdcInternet = sp.sp_bdc_internet_table as SpBdcInternetLigne[] | undefined;
  const bdcMat = sp.sp_bdc_materiel_table as SpBdcMaterielLigne[] | undefined;
  const cadeaux = sp.sp_cadeaux_table as SpCadeauLigne[] | undefined;

  // ── Feuille 0 : Comparatif complet ──────────────────────────────────────
  const ws0 = wb.addWorksheet('Comparatif complet');
  ws0.columns = [
    { width: 14 },
    { width: 24 },
    { width: 26 },
    { width: 22 },
    { width: 14 },
    { width: 18 },
    { width: 24 },
    { width: 28 },
    { width: 22 },
    { width: 14 },
    { width: 14 },
    { width: 38 },
  ];

  addMergedRow(ws0, `Comparatif SA/SP — ${clientName}`, 12, (cell, row) => {
    cell.font = { bold: true, size: 16, color: { argb: primaryArgb } };
    cell.alignment = { horizontal: 'center' };
    row.height = 24;
  });
  addMergedRow(ws0, `Généré le ${new Date().toLocaleDateString('fr-FR')}`, 12, (cell) => {
    cell.font = { italic: true, color: { argb: 'FF888888' }, size: 10 };
    cell.alignment = { horizontal: 'center' };
  });
  ws0.addRow([]);

  const fullSummaryData: string[][] = [
    ['Total mensuel', sp.sp_total_actuel || '—', sp.sp_total_propose || '—', sp.sp_economie_mensuelle || '—'],
    ['Économie annuelle', '', '', sp.sp_economie_annuelle || '—'],
  ];
  if (sp.sp_total_recurrent) fullSummaryData.push(['Récurrent mensuel SP', '', sp.sp_total_recurrent, '']);
  if (sp.sp_total_ponctuel) fullSummaryData.push(['Ponctuel total SP', '', sp.sp_total_ponctuel, '']);
  if (sp.sp_fas_total) fullSummaryData.push(['FAS total', '', sp.sp_fas_total, '']);
  if (sp.sp_remise_mois_offert) fullSummaryData.push(['Remise mois offerts', '', sp.sp_remise_mois_offert, '']);
  if (sp.sp_total_forfaits_mensuel_ht) fullSummaryData.push(['Total forfaits mensuel', '', sp.sp_total_forfaits_mensuel_ht, '']);
  if (sp.sp_total_materiel_ht) fullSummaryData.push(['Total matériel', '', sp.sp_total_materiel_ht, '']);
  if (sp.sp_total_bdc_operateur_ht) fullSummaryData.push(['Total BDC opérateur', '', sp.sp_total_bdc_operateur_ht, '']);
  if (sp.sp_total_bdc_internet_ht) fullSummaryData.push(['Total BDC internet', '', sp.sp_total_bdc_internet_ht, '']);
  if (sp.sp_total_bdc_materiel_ht) fullSummaryData.push(['Total BDC matériel', '', sp.sp_total_bdc_materiel_ht, '']);
  if (sp.sp_total_cadeaux_ht) fullSummaryData.push(['Total cadeaux', '', sp.sp_total_cadeaux_ht, '']);
  if (sp.sp_total_complet) fullSummaryData.push(['Total complet SP', '', sp.sp_total_complet, '']);
  if (sp.sp_loyer_mensuel) fullSummaryData.push(['Loyer mensuel', '', sp.sp_loyer_mensuel, '']);
  if (sp.sp_loyer_trimestriel) fullSummaryData.push(['Loyer trimestriel', '', sp.sp_loyer_trimestriel, '']);
  if (sp.sp_marge) fullSummaryData.push(['Marge', '', sp.sp_marge, '']);
  if (sp.sp_duree_mois) fullSummaryData.push(['Durée (mois)', '', String(sp.sp_duree_mois), '']);
  if (sp.sp_duree_trimestres) fullSummaryData.push(['Durée (trimestres)', '', sp.sp_duree_trimestres, '']);
  if (sp.sp_mois_offerts) fullSummaryData.push(['Mois offerts', '', String(sp.sp_mois_offerts), '']);
  if (sp.sp_date_limite_souscription) fullSummaryData.push(['Date limite souscription', '', sp.sp_date_limite_souscription, '']);
  if (sp.sp_fournisseur_propose) fullSummaryData.push(['Fournisseur proposé', '', sp.sp_fournisseur_propose, '']);
  if (adresseFacturation) fullSummaryData.push(['Adresse facturation', '', adresseFacturation, '']);
  if (adresseLivraison) fullSummaryData.push(['Adresse livraison', '', adresseLivraison, '']);

  addTableSection(
    ws0,
    'Synthèse',
    ['Indicateur', 'Situation Actuelle', 'Situation Proposée', 'Différence'],
    fullSummaryData,
    primaryArgb,
  );

  if (sp.sp_ameliorations) {
    addTextBlock(ws0, 'Points clés', sp.sp_ameliorations, primaryArgb, 12);
  }

  if (sp.suggestions.length > 0) {
    addTableSection(
      ws0,
      'Situation actuelle détaillée',
      ['Type', 'Ligne / Service', 'Offre actuelle', 'Fournisseur actuel', 'Prix actuel', 'Engagement', 'Site / Adresse', 'Détails source'],
      sp.suggestions.map((suggestion) => {
        const current = extractCurrentLineInfo(suggestion.ligne_actuelle);
        return [
          current.type,
          current.nom,
          current.offre,
          current.fournisseur,
          `${suggestion.prix_actuel.toFixed(2)} €`,
          current.engagement,
          current.site,
          current.details,
        ];
      }),
      primaryArgb,
    );

    addTableSection(
      ws0,
      'Comparatif détaillé',
      ['Type', 'Ligne / Service', 'Offre actuelle', 'Produit proposé', 'Fournisseur proposé', 'Prix actuel', 'Prix proposé', 'Économie', 'Justification'],
      sp.suggestions.map((suggestion) => {
        const current = extractCurrentLineInfo(suggestion.ligne_actuelle);
        return [
          current.type,
          current.nom,
          current.offre,
          suggestion.produit_propose_nom,
          suggestion.produit_propose_fournisseur || '',
          `${suggestion.prix_actuel.toFixed(2)} €`,
          `${suggestion.prix_propose.toFixed(2)} €`,
          `${suggestion.economie_mensuelle.toFixed(2)} €`,
          suggestion.justification,
        ];
      }),
      primaryArgb,
      ['', 'TOTAL', '', '', '', sp.sp_total_actuel || '', sp.sp_total_propose || '', sp.sp_economie_mensuelle || '', ''],
    );
  }

  const groupedForfaits = [
    { title: 'Forfaits mobiles', rows: sp.sp_lignes_mobiles },
    { title: 'Forfaits fixes', rows: sp.sp_lignes_fixes },
    { title: 'Forfaits internet', rows: sp.sp_internet },
  ];
  groupedForfaits.forEach((group) => {
    if (group.rows.length === 0) return;
    addTableSection(
      ws0,
      group.title,
      ['Type', 'Ligne', 'Produit proposé', 'Fournisseur', 'Prix actuel', 'Prix proposé', 'Économie', 'Analyse', 'Justification'],
      group.rows.map((l) => [
        l.sp_type_ligne,
        l.sp_nom_ligne,
        l.sp_produit,
        l.sp_produit_fournisseur || '',
        l.sp_prix_actuel,
        l.sp_prix_propose,
        l.sp_economie,
        l.sp_analyse,
        l.sp_justification,
      ]),
      primaryArgb,
    );
  });

  if (materielDetail.length > 0) {
    addTableSection(
      ws0,
      'Matériel',
      ['Équipement', 'Réf.', 'Fournisseur', 'Qté', 'Prix HT', 'Fréquence', 'Commentaire'],
      materielDetail.map((m) => [
        m.sp_matd_nom,
        m.sp_matd_ref || '',
        m.sp_matd_fournisseur || '',
        m.sp_matd_quantite,
        m.sp_matd_prix_ht,
        m.sp_matd_frequence,
        m.sp_matd_commentaire,
      ]),
      primaryArgb,
      sp.sp_total_materiel_ht ? ['TOTAL', '', '', '', sp.sp_total_materiel_ht, '', ''] : undefined,
    );
  }

  if (bdcOp && bdcOp.length > 0) {
    addTableSection(
      ws0,
      'BDC Opérateur',
      ['Type', 'Ligne', 'Produit', 'Fournisseur', 'Prix actuel', 'Prix mensuel HT', 'Économie'],
      bdcOp.map((l) => [
        l.sp_bdc_op_type,
        l.sp_bdc_op_nom,
        l.sp_bdc_op_produit || '',
        l.sp_bdc_op_fournisseur || '',
        l.sp_bdc_op_prix_actuel || '',
        l.sp_bdc_op_prix_mensuel_ht,
        l.sp_bdc_op_economie || '',
      ]),
      primaryArgb,
      sp.sp_total_bdc_operateur_ht ? ['', 'TOTAL', '', '', '', sp.sp_total_bdc_operateur_ht, ''] : undefined,
    );
  }

  if (bdcInternet && bdcInternet.length > 0) {
    addTableSection(
      ws0,
      'BDC Internet',
      ['Ligne', 'Produit', 'Fournisseur', 'Prix actuel', 'Prix mensuel HT'],
      bdcInternet.map((l) => [
        l.sp_bdc_int_nom,
        l.sp_bdc_int_produit || '',
        l.sp_bdc_int_fournisseur || '',
        l.sp_bdc_int_prix_actuel || '',
        l.sp_bdc_int_prix_mensuel_ht,
      ]),
      primaryArgb,
      sp.sp_total_bdc_internet_ht ? ['TOTAL', '', '', '', sp.sp_total_bdc_internet_ht] : undefined,
    );
  }

  if (bdcMat && bdcMat.length > 0) {
    addTableSection(
      ws0,
      'BDC Matériel',
      ['Équipement', 'Réf.', 'Fournisseur', 'Prix HT', 'Fréquence'],
      bdcMat.map((m) => [
        m.sp_bdc_mat_nom,
        m.sp_bdc_mat_ref || '',
        m.sp_bdc_mat_fournisseur || '',
        m.sp_bdc_mat_prix_ht,
        m.sp_bdc_mat_frequence,
      ]),
      primaryArgb,
      sp.sp_total_bdc_materiel_ht ? ['TOTAL', '', '', sp.sp_total_bdc_materiel_ht, ''] : undefined,
    );
  }

  if (cadeaux && cadeaux.length > 0) {
    addTableSection(
      ws0,
      'Cadeaux',
      ['Cadeau', 'Réf.', 'Valeur HT'],
      cadeaux.map((m) => [m.sp_cadeau_nom, m.sp_cadeau_ref || '', m.sp_cadeau_valeur_ht]),
      primaryArgb,
      sp.sp_total_cadeaux_ht ? ['TOTAL', '', sp.sp_total_cadeaux_ht] : undefined,
    );
  }
  ws0.views = [{ state: 'frozen', ySplit: 3 }];

  // ── Feuille 1 : Synthèse ────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Synthèse');
  ws1.properties.defaultColWidth = 28;

  ws1.mergeCells('A1:D1');
  const title = ws1.getCell('A1');
  title.value = `Comparatif SA/SP — ${clientName}`;
  title.font = { bold: true, size: 16, color: { argb: primaryArgb } };
  title.alignment = { horizontal: 'center' };

  ws1.mergeCells('A2:D2');
  const dateCell = ws1.getCell('A2');
  dateCell.value = `Généré le ${new Date().toLocaleDateString('fr-FR')}`;
  dateCell.font = { italic: true, color: { argb: 'FF888888' }, size: 10 };
  dateCell.alignment = { horizontal: 'center' };

  const summaryHeaders = ['Indicateur', 'Situation Actuelle', 'Situation Proposée', 'Différence'];
  const headerRow = ws1.getRow(4);
  headerRow.values = summaryHeaders;
  styleHeader(headerRow, primaryArgb);

  const summaryData: [string, string, string, string][] = [
    ['Total mensuel', sp.sp_total_actuel || '—', sp.sp_total_propose || '—', sp.sp_economie_mensuelle || '—'],
    ['Économie annuelle', '', '', sp.sp_economie_annuelle || '—'],
  ];
  if (sp.sp_total_recurrent) summaryData.push(['Récurrent mensuel SP', '', sp.sp_total_recurrent, '']);
  if (sp.sp_total_ponctuel) summaryData.push(['Ponctuel total SP', '', sp.sp_total_ponctuel, '']);
  if (sp.sp_fas_total) summaryData.push(['FAS total', '', sp.sp_fas_total, '']);
  if (sp.sp_remise_mois_offert) summaryData.push(['Remise mois offerts', '', sp.sp_remise_mois_offert, '']);
  if (sp.sp_total_forfaits_mensuel_ht) summaryData.push(['Total forfaits mensuel', '', sp.sp_total_forfaits_mensuel_ht, '']);
  if (sp.sp_total_materiel_ht) summaryData.push(['Total matériel', '', sp.sp_total_materiel_ht, '']);
  if (sp.sp_total_bdc_operateur_ht) summaryData.push(['Total BDC opérateur', '', sp.sp_total_bdc_operateur_ht, '']);
  if (sp.sp_total_bdc_internet_ht) summaryData.push(['Total BDC internet', '', sp.sp_total_bdc_internet_ht, '']);
  if (sp.sp_total_bdc_materiel_ht) summaryData.push(['Total BDC matériel', '', sp.sp_total_bdc_materiel_ht, '']);
  if (sp.sp_total_cadeaux_ht) summaryData.push(['Total cadeaux', '', sp.sp_total_cadeaux_ht, '']);
  if (sp.sp_total_complet) summaryData.push(['Total complet SP', '', sp.sp_total_complet, '']);
  if (sp.sp_loyer_mensuel) summaryData.push(['Loyer mensuel', '', sp.sp_loyer_mensuel, '']);
  if (sp.sp_loyer_trimestriel) summaryData.push(['Loyer trimestriel', '', sp.sp_loyer_trimestriel, '']);
  if (sp.sp_marge) summaryData.push(['Marge', '', sp.sp_marge, '']);
  if (sp.sp_duree_mois) summaryData.push(['Durée (mois)', '', String(sp.sp_duree_mois), '']);
  if (sp.sp_duree_trimestres) summaryData.push(['Durée (trimestres)', '', sp.sp_duree_trimestres, '']);
  if (sp.sp_mois_offerts) summaryData.push(['Mois offerts', '', String(sp.sp_mois_offerts), '']);
  if (sp.sp_date_limite_souscription) summaryData.push(['Date limite souscription', '', sp.sp_date_limite_souscription, '']);
  if (sp.sp_fournisseur_propose) summaryData.push(['Fournisseur proposé', '', sp.sp_fournisseur_propose, '']);
  if (adresseFacturation) summaryData.push(['Adresse facturation', '', adresseFacturation, '']);
  if (adresseLivraison) summaryData.push(['Adresse livraison', '', adresseLivraison, '']);

  summaryData.forEach((rowData, i) => {
    const r = ws1.addRow(rowData);
    styleAlt(r, i);
    r.getCell(1).font = { bold: true };
  });

  if (sp.sp_ameliorations) {
    const startRow = ws1.lastRow ? ws1.lastRow.number + 2 : 8;
    ws1.mergeCells(`A${startRow}:D${startRow}`);
    const label = ws1.getCell(`A${startRow}`);
    label.value = 'Points clés';
    label.font = { bold: true, color: { argb: primaryArgb } };

    ws1.mergeCells(`A${startRow + 1}:D${startRow + 3}`);
    const content = ws1.getCell(`A${startRow + 1}`);
    content.value = sp.sp_ameliorations;
    content.alignment = { wrapText: true, vertical: 'top' };
  }

  // ── Feuille 2 : Comparatif détaillé ─────────────────────────────────────
  const ws2 = wb.addWorksheet('Comparatif détaillé');
  ws2.columns = [
    { key: 'type', width: 12 },
    { key: 'nom', width: 26 },
    { key: 'offre_actuelle', width: 28 },
    { key: 'fournisseur_actuel', width: 20 },
    { key: 'prix_actuel', width: 14 },
    { key: 'engagement', width: 18 },
    { key: 'site', width: 24 },
    { key: 'produit_propose', width: 28 },
    { key: 'fournisseur_propose', width: 20 },
    { key: 'prix_propose', width: 14 },
    { key: 'economie', width: 14 },
    { key: 'commentaire', width: 38 },
  ];
  const h2 = ws2.addRow([
    'Type',
    'Ligne / Service',
    'Offre actuelle',
    'Fournisseur actuel',
    'Prix actuel',
    'Engagement',
    'Site / Adresse',
    'Produit proposé',
    'Fournisseur proposé',
    'Prix proposé',
    'Économie',
    'Justification',
  ]);
  styleHeader(h2, primaryArgb);

  sp.suggestions.forEach((suggestion, i) => {
    const current = extractCurrentLineInfo(suggestion.ligne_actuelle);
    const r = ws2.addRow([
      current.type,
      current.nom,
      current.offre,
      current.fournisseur,
      `${suggestion.prix_actuel.toFixed(2)} €`,
      current.engagement,
      current.site,
      suggestion.produit_propose_nom,
      suggestion.produit_propose_fournisseur || '',
      `${suggestion.prix_propose.toFixed(2)} €`,
      `${suggestion.economie_mensuelle.toFixed(2)} €`,
      suggestion.justification,
    ]);
    styleAlt(r, i);
  });
  if (sp.suggestions.length > 0) {
    const tot = ws2.addRow([
      '',
      'TOTAL',
      '',
      '',
      sp.sp_total_actuel || '',
      '',
      '',
      '',
      '',
      sp.sp_total_propose || '',
      sp.sp_economie_mensuelle || '',
      '',
    ]);
    styleTotal(tot, primaryArgb);
  }

  // ── Feuille 3 : Situation actuelle ──────────────────────────────────────
  const ws3 = wb.addWorksheet('Situation actuelle');
  ws3.columns = [
    { key: 'type', width: 14 },
    { key: 'nom', width: 26 },
    { key: 'offre', width: 28 },
    { key: 'fournisseur', width: 20 },
    { key: 'engagement', width: 18 },
    { key: 'site', width: 24 },
    { key: 'details', width: 60 },
  ];
  const h3 = ws3.addRow(['Type', 'Ligne / Service', 'Offre actuelle', 'Fournisseur actuel', 'Engagement', 'Site / Adresse', 'Détails source']);
  styleHeader(h3, primaryArgb);
  sp.suggestions.forEach((suggestion, i) => {
    const current = extractCurrentLineInfo(suggestion.ligne_actuelle);
    const r = ws3.addRow([
      current.type,
      current.nom,
      current.offre,
      current.fournisseur,
      current.engagement,
      current.site,
      current.details,
    ]);
    styleAlt(r, i);
  });

  // ── Feuille 4 : Forfaits ────────────────────────────────────────────────
  const ws4 = wb.addWorksheet('Forfaits');
  ws4.columns = [
    { key: 'type', width: 12 },
    { key: 'nom', width: 28 },
    { key: 'produit', width: 28 },
    { key: 'fournisseur', width: 20 },
    { key: 'prix_actuel', width: 16 },
    { key: 'prix_propose', width: 16 },
    { key: 'economie', width: 16 },
    { key: 'analyse', width: 35 },
    { key: 'justification', width: 35 },
  ];
  const h4 = ws4.addRow(['Type', 'Ligne', 'Produit proposé', 'Fournisseur', 'Prix actuel', 'Prix proposé', 'Économie', 'Analyse', 'Justification']);
  styleHeader(h4, primaryArgb);

  allForfaits.forEach((l, i) => {
    const r = ws4.addRow([
      l.sp_type_ligne, l.sp_nom_ligne, l.sp_produit,
      l.sp_produit_fournisseur || '',
      l.sp_prix_actuel, l.sp_prix_propose, l.sp_economie,
      l.sp_analyse, l.sp_justification,
    ]);
    styleAlt(r, i);
  });
  if (allForfaits.length > 0) {
    const tot = ws4.addRow(['', 'TOTAL', '', '', sp.sp_total_actuel || '', sp.sp_total_propose || '', sp.sp_economie_mensuelle || '', '', '']);
    styleTotal(tot, primaryArgb);
  }

  // ── Feuille 5 : Matériel ────────────────────────────────────────────────
  if (materielDetail.length > 0) {
    const ws5 = wb.addWorksheet('Matériel');
    ws5.columns = [
      { key: 'nom', width: 32 },
      { key: 'ref', width: 16 },
      { key: 'fournisseur', width: 20 },
      { key: 'quantite', width: 10 },
      { key: 'prix', width: 18 },
      { key: 'frequence', width: 16 },
      { key: 'commentaire', width: 35 },
    ];
    const h5 = ws5.addRow(['Équipement', 'Réf.', 'Fournisseur', 'Qté', 'Prix HT', 'Fréquence', 'Commentaire']);
    styleHeader(h5, primaryArgb);
    materielDetail.forEach((m, i) => {
      const r = ws5.addRow([
        m.sp_matd_nom, m.sp_matd_ref || '',
        m.sp_matd_fournisseur || '',
        m.sp_matd_quantite,
        m.sp_matd_prix_ht,
        m.sp_matd_frequence,
        m.sp_matd_commentaire,
      ]);
      styleAlt(r, i);
    });
    if (sp.sp_total_materiel_ht) {
      const tot = ws5.addRow(['TOTAL', '', '', '', sp.sp_total_materiel_ht, '', '']);
      styleTotal(tot, primaryArgb);
    }
  }

  // ── Feuille 6 : BDC Opérateur ───────────────────────────────────────────
  if (bdcOp && bdcOp.length > 0) {
    const ws6 = wb.addWorksheet('BDC Opérateur');
    ws6.columns = [
      { key: 'type', width: 12 },
      { key: 'nom', width: 28 },
      { key: 'produit', width: 28 },
      { key: 'fournisseur', width: 20 },
      { key: 'prix_actuel', width: 18 },
      { key: 'prix', width: 18 },
      { key: 'economie', width: 18 },
    ];
    const h6 = ws6.addRow(['Type', 'Ligne', 'Produit', 'Fournisseur', 'Prix actuel', 'Prix mensuel HT', 'Économie']);
    styleHeader(h6, primaryArgb);
    bdcOp.forEach((l, i) => {
      const r = ws6.addRow([
        l.sp_bdc_op_type, l.sp_bdc_op_nom,
        l.sp_bdc_op_produit || '', l.sp_bdc_op_fournisseur || '',
        l.sp_bdc_op_prix_actuel || '',
        l.sp_bdc_op_prix_mensuel_ht,
        l.sp_bdc_op_economie || '',
      ]);
      styleAlt(r, i);
    });
    if (sp.sp_total_bdc_operateur_ht) {
      const tot = ws6.addRow(['', 'TOTAL', '', '', '', sp.sp_total_bdc_operateur_ht, '']);
      styleTotal(tot, primaryArgb);
    }
  }

  // ── Feuille 7 : BDC Internet ────────────────────────────────────────────
  if (bdcInternet && bdcInternet.length > 0) {
    const ws7 = wb.addWorksheet('BDC Internet');
    ws7.columns = [
      { key: 'nom', width: 28 },
      { key: 'produit', width: 28 },
      { key: 'fournisseur', width: 20 },
      { key: 'prix_actuel', width: 18 },
      { key: 'prix', width: 18 },
    ];
    const h7 = ws7.addRow(['Ligne', 'Produit', 'Fournisseur', 'Prix actuel', 'Prix mensuel HT']);
    styleHeader(h7, primaryArgb);
    bdcInternet.forEach((l, i) => {
      const r = ws7.addRow([
        l.sp_bdc_int_nom,
        l.sp_bdc_int_produit || '',
        l.sp_bdc_int_fournisseur || '',
        l.sp_bdc_int_prix_actuel || '',
        l.sp_bdc_int_prix_mensuel_ht,
      ]);
      styleAlt(r, i);
    });
    if (sp.sp_total_bdc_internet_ht) {
      const tot = ws7.addRow(['TOTAL', '', '', '', sp.sp_total_bdc_internet_ht]);
      styleTotal(tot, primaryArgb);
    }
  }

  // ── Feuille 8 : BDC Matériel ────────────────────────────────────────────
  if (bdcMat && bdcMat.length > 0) {
    const ws8 = wb.addWorksheet('BDC Matériel');
    ws8.columns = [
      { key: 'nom', width: 32 },
      { key: 'ref', width: 16 },
      { key: 'fournisseur', width: 20 },
      { key: 'prix', width: 16 },
      { key: 'frequence', width: 16 },
    ];
    const h8 = ws8.addRow(['Équipement', 'Réf.', 'Fournisseur', 'Prix HT', 'Fréquence']);
    styleHeader(h8, primaryArgb);
    bdcMat.forEach((m, i) => {
      const r = ws8.addRow([
        m.sp_bdc_mat_nom, m.sp_bdc_mat_ref || '',
        m.sp_bdc_mat_fournisseur || '',
        m.sp_bdc_mat_prix_ht, m.sp_bdc_mat_frequence,
      ]);
      styleAlt(r, i);
    });
    if (sp.sp_total_bdc_materiel_ht) {
      const tot = ws8.addRow(['TOTAL', '', '', sp.sp_total_bdc_materiel_ht, '']);
      styleTotal(tot, primaryArgb);
    }
  }

  // ── Feuille 9 : Cadeaux ─────────────────────────────────────────────────
  if (cadeaux && cadeaux.length > 0) {
    const ws9 = wb.addWorksheet('Cadeaux');
    ws9.columns = [
      { key: 'nom', width: 32 },
      { key: 'ref', width: 16 },
      { key: 'valeur', width: 18 },
    ];
    const h9 = ws9.addRow(['Cadeau', 'Réf.', 'Valeur HT']);
    styleHeader(h9, primaryArgb);
    cadeaux.forEach((m, i) => {
      const r = ws9.addRow([m.sp_cadeau_nom, m.sp_cadeau_ref || '', m.sp_cadeau_valeur_ht]);
      styleAlt(r, i);
    });
    if (sp.sp_total_cadeaux_ht) {
      const tot = ws9.addRow(['TOTAL', '', sp.sp_total_cadeaux_ht]);
      styleTotal(tot, primaryArgb);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
