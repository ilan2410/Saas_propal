import ExcelJS from 'exceljs';
import type { ExportSaSpInput, RecapExportLine } from '@/types';

const HEADER_BG = (primary: string) => `FF${primary.replace('#', '').toUpperCase()}`;
const TOTAL_BG = 'FFE3F2FD';
const ALT_BG = 'FFF7F9FC';
const BORDER_COLOR = 'FFCBD5E1';

function eur(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function thinBorder() {
  return {
    top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  };
}

function styleHeaderRow(row: ExcelJS.Row, primaryArgb: string) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  row.height = 22;
}

function styleDataRow(row: ExcelJS.Row, isAlt: boolean) {
  row.eachCell((cell) => {
    if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_BG } };
    cell.font = { size: 10 };
    cell.border = thinBorder();
    if (cell.alignment == null) {
      cell.alignment = { vertical: 'middle' };
    } else {
      cell.alignment = { ...cell.alignment, vertical: 'middle' };
    }
  });
  row.height = 18;
}

function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
    cell.font = { bold: true, size: 10 };
    cell.border = thinBorder();
  });
  row.height = 20;
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  for (let i = 0; i < widths.length; i++) {
    ws.getColumn(i + 1).width = widths[i];
  }
}

function recapTypeLabel(t: RecapExportLine['type']): string {
  switch (t) {
    case 'materiel':
      return 'Matériel';
    case 'installation':
      return 'Installation';
    case 'cadeau':
      return 'Cadeau';
    case 'fas':
      return 'FAS';
    case 'marge':
      return 'Marge';
  }
}

export async function generateComparatifSaSpExcel(input: ExportSaSpInput): Promise<Buffer> {
  const primaryArgb = HEADER_BG(input.primaryColor);

  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet('Récap', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // 12 colonnes pour permettre le layout en bas (6 + 6)
  setColumnWidths(ws, [16, 14, 7, 28, 18, 14, 14, 18, 14, 7, 14, 14]);

  let r = 1;

  // ── 1. EN-TÊTE CLIENT ────────────────────────────────────────────
  const fields: Array<[string, string | undefined]> = [
    ['RAISON SOCIALE', input.clientRaisonSociale],
    ['ADRESSE', input.clientAdresse],
    ['CONTACT', input.clientNom || input.clientPrenom
      ? `${input.clientPrenom ?? ''} ${input.clientNom ?? ''}`.trim()
      : input.clientEmail],
    ['CP', input.clientCp],
    ['VILLE', input.clientVille],
    ['TEL', input.clientTel],
  ];

  for (const [label, value] of fields) {
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, size: 10, color: { argb: primaryArgb } };
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(2).value = value ?? '';
    row.getCell(2).font = { size: 10 };
    row.getCell(2).alignment = { vertical: 'middle' };
    ws.mergeCells(r, 2, r, 7);
    row.height = 18;
    r++;
  }

  // Date proposition (à droite)
  ws.getCell(1, 9).value = `Date : ${input.dateProposition}`;
  ws.getCell(1, 9).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  ws.mergeCells(1, 9, 1, 12);

  r++; // ligne vide

  // ── 2. TABLEAU SITUATION ACTUELLE ────────────────────────────────
  ws.mergeCells(r, 1, r, 7);
  const titleSa = ws.getRow(r);
  titleSa.getCell(1).value = 'SITUATION ACTUELLE';
  titleSa.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleSa.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleSa.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  titleSa.height = 24;
  r++;

  const saHeader = ws.getRow(r);
  ['Opérateur', 'Date fin eng', 'Qté', 'Offre', 'Numéro', 'PRIX HT', 'Indemnités'].forEach(
    (h, i) => (saHeader.getCell(i + 1).value = h),
  );
  styleHeaderRow(saHeader, primaryArgb);
  r++;

  input.saLines.forEach((line, idx) => {
    const row = ws.getRow(r);
    row.getCell(1).value = line.operateur;
    row.getCell(2).value = line.dateFinEngagement;
    row.getCell(3).value = line.quantite;
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).value = line.offre;
    row.getCell(5).value = line.numero;
    row.getCell(6).value = eur(line.prixHt);
    row.getCell(6).alignment = { horizontal: 'right' };
    row.getCell(7).value = eur(line.indemnites);
    row.getCell(7).alignment = { horizontal: 'right' };
    styleDataRow(row, idx % 2 === 1);
    r++;
  });

  // Total SA
  const saTotal = ws.getRow(r);
  saTotal.getCell(1).value = 'TOTAL';
  ws.mergeCells(r, 1, r, 5);
  saTotal.getCell(6).value = eur(input.saTotalPrixHt);
  saTotal.getCell(6).alignment = { horizontal: 'right' };
  saTotal.getCell(7).value = eur(input.saTotalIndemnites);
  saTotal.getCell(7).alignment = { horizontal: 'right' };
  styleTotalRow(saTotal);
  r += 2;

  // ── 3. TABLEAU SOLUTION PROPOSÉE ─────────────────────────────────
  ws.mergeCells(r, 1, r, 6);
  const titleSp = ws.getRow(r);
  titleSp.getCell(1).value = 'SOLUTION PROPOSÉE';
  titleSp.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleSp.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleSp.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  titleSp.height = 24;
  r++;

  const spHeader = ws.getRow(r);
  ['Opérateur', 'Qté', 'Offre', 'Numéro', 'Prix', 'Prix Total'].forEach(
    (h, i) => (spHeader.getCell(i + 1).value = h),
  );
  styleHeaderRow(spHeader, primaryArgb);
  r++;

  input.spLines.forEach((line, idx) => {
    const row = ws.getRow(r);
    row.getCell(1).value = line.operateur;
    row.getCell(2).value = line.quantite;
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).value = line.offre;
    row.getCell(4).value = line.numero;
    row.getCell(5).value = line.isRemiseLine ? '' : eur(line.prixUnitaire);
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).value = eur(line.prixTotal);
    row.getCell(6).alignment = { horizontal: 'right' };

    if (line.isRemiseLine) {
      // Style spécial pour la ligne "Remise" : italique, texte gris, pas d'alternance
      row.eachCell((cell) => {
        cell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
        cell.border = thinBorder();
      });
    } else {
      styleDataRow(row, idx % 2 === 1);
    }
    r++;
  });

  const spTotal = ws.getRow(r);
  spTotal.getCell(1).value = 'TOTAL';
  ws.mergeCells(r, 1, r, 5);
  spTotal.getCell(6).value = eur(input.spTotalPrix);
  spTotal.getCell(6).alignment = { horizontal: 'right' };
  styleTotalRow(spTotal);
  r += 2;

  // ── 4. ZONE BAS : RECAPITULATIF + REMISE COMMERCIALE ─────────────
  // Récap occupe colonnes 1-5, Remise (vertical) occupe colonnes 7-9
  const recapTitleRow = r;
  ws.mergeCells(recapTitleRow, 1, recapTitleRow, 5);
  ws.getCell(recapTitleRow, 1).value = 'RECAPITULATIF DU DOSSIER';
  ws.getCell(recapTitleRow, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  ws.getCell(recapTitleRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(recapTitleRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };

  ws.mergeCells(recapTitleRow, 7, recapTitleRow, 9);
  ws.getCell(recapTitleRow, 7).value = 'REMISE COMMERCIALE';
  ws.getCell(recapTitleRow, 7).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  ws.getCell(recapTitleRow, 7).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(recapTitleRow, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryArgb } };
  ws.getRow(recapTitleRow).height = 24;
  r++;

  // Headers récap (cols 1-5)
  const headersRow = ws.getRow(r);
  ['Type', 'Désignation', 'PUHT', 'Qté', 'PTHT'].forEach(
    (h, i) => (headersRow.getCell(i + 1).value = h),
  );
  styleHeaderRow(headersRow, primaryArgb);
  r++;

  // ── REMISE COMMERCIALE verticale : libellé (col 7-8 fusionnées) | valeur (col 9) ──
  const remiseStartRow = recapTitleRow + 1;
  const remiseRows: Array<{ label: string; value: number; isTotal?: boolean }> = [
    { label: 'Mois offerts', value: input.remiseMoisOffert },
    { label: 'Solde contrat', value: input.remiseSoldeContrat },
    { label: 'Total mat+inst+FAS+cadeaux', value: input.remiseTotalPonctuel },
    { label: 'TOTAL', value: input.remiseTotal, isTotal: true },
  ];
  remiseRows.forEach((rr, idx) => {
    const rowIdx = remiseStartRow + idx;
    ws.mergeCells(rowIdx, 7, rowIdx, 8);
    ws.getCell(rowIdx, 7).value = rr.label;
    ws.getCell(rowIdx, 7).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getCell(rowIdx, 9).value = eur(rr.value);
    ws.getCell(rowIdx, 9).alignment = { horizontal: 'right', vertical: 'middle' };
    for (const c of [7, 8, 9]) {
      const cell = ws.getCell(rowIdx, c);
      cell.font = { size: 10, bold: !!rr.isTotal };
      cell.border = thinBorder();
      if (rr.isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
      } else if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_BG } };
      }
    }
    ws.getRow(rowIdx).height = 20;
  });
  const remiseLastRow = remiseStartRow + remiseRows.length - 1;

  // Recap lines (start at same row as remise values = recapTitleRow + 2)
  let recapR = r;
  input.recapLines.forEach((line, idx) => {
    const row = ws.getRow(recapR);
    row.getCell(1).value = recapTypeLabel(line.type);
    row.getCell(2).value = line.libelle;
    row.getCell(3).value = line.puht != null ? eur(line.puht) : '—';
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(4).value = line.quantite != null ? line.quantite : '—';
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).value = eur(line.ptht);
    row.getCell(5).alignment = { horizontal: 'right' };
    // style 5 cells of recap (cols 1-5)
    for (let c = 1; c <= 5; c++) {
      const cell = row.getCell(c);
      cell.font = { size: 10 };
      cell.border = thinBorder();
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_BG } };
      }
    }
    row.height = Math.max(row.height ?? 18, 18);
    recapR++;
  });

  // Recap TOTAL
  const recapTotalR = recapR;
  ws.getCell(recapTotalR, 1).value = 'TOTAL';
  ws.mergeCells(recapTotalR, 1, recapTotalR, 4);
  ws.getCell(recapTotalR, 5).value = eur(input.recapTotal);
  ws.getCell(recapTotalR, 5).alignment = { horizontal: 'right' };
  for (let c = 1; c <= 5; c++) {
    const cell = ws.getCell(recapTotalR, c);
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
    cell.border = thinBorder();
  }
  ws.getRow(recapTotalR).height = 20;
  recapR++;

  // Footer
  const footerR = Math.max(recapR, remiseLastRow + 1) + 2;
  ws.getCell(footerR, 1).value = `Document généré par ${input.companyName} — ${input.dateProposition}`;
  ws.getCell(footerR, 1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };
  ws.mergeCells(footerR, 1, footerR, 12);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
