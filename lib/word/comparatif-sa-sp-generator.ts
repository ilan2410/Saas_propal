import type { ExportSaSpInput, RecapExportLine } from '@/types';

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eur(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
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

export async function generateComparatifSaSpWord(input: ExportSaSpInput): Promise<Buffer> {
  const primary = /^#[0-9a-fA-F]{6}$/.test(input.primaryColor) ? input.primaryColor : '#0D4073';
  const totalBg = '#E3F2FD';
  const altBg = '#F7F9FC';
  const borderColor = '#CBD5E1';

  const logoBlock = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="logo" style="max-height:55px;max-width:160px;float:right;"/>`
    : '';

  const headerCell = (text: string) =>
    `<th style="background:${primary};color:#fff;font-weight:bold;border:1px solid ${borderColor};padding:6px 8px;text-align:center;font-size:10pt;">${esc(text)}</th>`;

  const dataCell = (text: string | number, opts: { align?: string; alt?: boolean; bold?: boolean } = {}) => {
    const bg = opts.alt ? `background:${altBg};` : '';
    const align = opts.align ? `text-align:${opts.align};` : '';
    const bold = opts.bold ? 'font-weight:bold;' : '';
    return `<td style="border:1px solid ${borderColor};padding:5px 8px;font-size:10pt;${bg}${align}${bold}">${esc(text)}</td>`;
  };

  const totalCell = (text: string | number, opts: { align?: string; colspan?: number } = {}) => {
    const align = opts.align ? `text-align:${opts.align};` : '';
    const colspan = opts.colspan ? ` colspan="${opts.colspan}"` : '';
    return `<td${colspan} style="border:1px solid ${borderColor};padding:6px 8px;font-size:10pt;background:${totalBg};font-weight:bold;${align}">${esc(text)}</td>`;
  };

  const sectionTitle = (text: string, colspan: number) =>
    `<tr><td colspan="${colspan}" style="background:${primary};color:#fff;font-weight:bold;font-size:12pt;padding:8px;text-align:center;">${esc(text)}</td></tr>`;

  // ── 1. En-tête client ──
  const clientHeader = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
      <tr>
        <td style="vertical-align:top;width:60%;">
          <table style="border-collapse:collapse;font-size:10pt;">
            ${[
              ['RAISON SOCIALE', input.clientRaisonSociale],
              ['ADRESSE', input.clientAdresse],
              ['CONTACT', (input.clientPrenom || input.clientNom)
                ? `${input.clientPrenom ?? ''} ${input.clientNom ?? ''}`.trim()
                : input.clientEmail],
              ['CP', input.clientCp],
              ['VILLE', input.clientVille],
              ['TEL', input.clientTel],
            ]
              .map(([label, value]) => `
                <tr>
                  <td style="font-weight:bold;color:${primary};padding:2px 12px 2px 0;">${esc(String(label))}</td>
                  <td style="padding:2px 0;">${esc(value ?? '')}</td>
                </tr>`)
              .join('')}
          </table>
        </td>
        <td style="vertical-align:top;width:40%;text-align:right;">
          ${logoBlock}
          <p style="margin:8px 0 0 0;font-size:9pt;color:#666;font-style:italic;">Date : ${esc(input.dateProposition)}</p>
        </td>
      </tr>
    </table>
  `;

  // ── 2. Tableau Situation Actuelle ──
  const saTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${sectionTitle('SITUATION ACTUELLE', 7)}
      <tr>
        ${['Opérateur', 'Date fin eng', 'Qté', 'Offre', 'Numéro', 'PRIX HT', 'Indemnités']
          .map(headerCell)
          .join('')}
      </tr>
      ${input.saLines
        .map(
          (l, i) => `<tr>
            ${dataCell(l.operateur, { alt: i % 2 === 1 })}
            ${dataCell(l.dateFinEngagement, { alt: i % 2 === 1 })}
            ${dataCell(l.quantite, { alt: i % 2 === 1, align: 'center' })}
            ${dataCell(l.offre, { alt: i % 2 === 1 })}
            ${dataCell(l.numero, { alt: i % 2 === 1 })}
            ${dataCell(eur(l.prixHt), { alt: i % 2 === 1, align: 'right' })}
            ${dataCell(eur(l.indemnites), { alt: i % 2 === 1, align: 'right' })}
          </tr>`,
        )
        .join('')}
      <tr>
        ${totalCell('TOTAL', { colspan: 5, align: 'left' })}
        ${totalCell(eur(input.saTotalPrixHt), { align: 'right' })}
        ${totalCell(eur(input.saTotalIndemnites), { align: 'right' })}
      </tr>
    </table>
  `;

  // ── 3. Tableau Solution Proposée ──
  const spTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${sectionTitle('SOLUTION PROPOSÉE', 6)}
      <tr>
        ${['Opérateur', 'Qté', 'Offre', 'Numéro', 'Prix', 'Prix Total']
          .map(headerCell)
          .join('')}
      </tr>
      ${input.spLines
        .map(
          (l, i) => {
            const isRemise = l.isRemiseLine;
            const prixCell = isRemise
              ? `<td style="border:1px solid ${borderColor};padding:5px 8px;font-size:10pt;text-align:right;font-style:italic;color:#666;">—</td>`
              : dataCell(eur(l.prixUnitaire), { alt: i % 2 === 1, align: 'right' });
            const prixTotalCell = isRemise
              ? `<td style="border:1px solid ${borderColor};padding:5px 8px;font-size:10pt;text-align:right;font-style:italic;color:#666;">${esc(eur(l.prixTotal))}</td>`
              : dataCell(eur(l.prixTotal), { alt: i % 2 === 1, align: 'right' });
            const offreCell = isRemise
              ? `<td style="border:1px solid ${borderColor};padding:5px 8px;font-size:10pt;font-style:italic;color:#666;">${esc(l.offre)}</td>`
              : dataCell(l.offre, { alt: i % 2 === 1 });
            return `<tr>
              ${dataCell(l.operateur, { alt: i % 2 === 1 })}
              ${dataCell(l.quantite, { alt: i % 2 === 1, align: 'center' })}
              ${offreCell}
              ${dataCell(l.numero, { alt: i % 2 === 1 })}
              ${prixCell}
              ${prixTotalCell}
            </tr>`;
          },
        )
        .join('')}
      <tr>
        ${totalCell('TOTAL', { colspan: 5, align: 'left' })}
        ${totalCell(eur(input.spTotalPrix), { align: 'right' })}
      </tr>
    </table>
  `;

  // ── 4. Récapitulatif du dossier ──
  const recapTable = `
    <table style="width:100%;border-collapse:collapse;">
      ${sectionTitle('RECAPITULATIF DU DOSSIER', 5)}
      <tr>
        ${['Type', 'Désignation', 'PUHT', 'Qté', 'PTHT'].map(headerCell).join('')}
      </tr>
      ${input.recapLines
        .map(
          (l, i) => `<tr>
            ${dataCell(recapTypeLabel(l.type), { alt: i % 2 === 1 })}
            ${dataCell(l.libelle, { alt: i % 2 === 1 })}
            ${dataCell(l.puht != null ? eur(l.puht) : '—', { alt: i % 2 === 1, align: 'right' })}
            ${dataCell(l.quantite != null ? l.quantite : '—', { alt: i % 2 === 1, align: 'center' })}
            ${dataCell(eur(l.ptht), { alt: i % 2 === 1, align: 'right' })}
          </tr>`,
        )
        .join('')}
      <tr>
        ${totalCell('TOTAL', { colspan: 4, align: 'left' })}
        ${totalCell(eur(input.recapTotal), { align: 'right' })}
      </tr>
    </table>
  `;

  // ── 5. Remise commerciale ──
  const remiseTable = `
    <table style="width:100%;border-collapse:collapse;">
      ${sectionTitle('REMISE COMMERCIALE', 4)}
      <tr>
        ${['Mois offerts', 'Solde contrat', 'Total mat+inst+FAS+cadeaux', 'TOTAL']
          .map(headerCell)
          .join('')}
      </tr>
      <tr>
        ${dataCell(eur(input.remiseMoisOffert), { align: 'right' })}
        ${dataCell(eur(input.remiseSoldeContrat), { align: 'right' })}
        ${dataCell(eur(input.remiseTotalPonctuel), { align: 'right' })}
        ${totalCell(eur(input.remiseTotal), { align: 'right' })}
      </tr>
    </table>
  `;

  // Layout bas : récap + remise côte à côte
  const bottomLayout = `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr>
        <td style="vertical-align:top;width:55%;padding-right:8px;">${recapTable}</td>
        <td style="vertical-align:top;width:45%;padding-left:8px;">${remiseTable}</td>
      </tr>
    </table>
  `;

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8" />
  <title>Récapitulatif ${esc(input.clientRaisonSociale ?? '')}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #1f2937; margin: 0; padding: 24px; }
    h1 { color: ${primary}; font-size: 16pt; margin: 0 0 12px 0; }
    table { font-family: Calibri, Arial, sans-serif; }
  </style>
</head>
<body>
  <h1>Récapitulatif commercial</h1>
  ${clientHeader}
  ${saTable}
  ${spTable}
  ${bottomLayout}
  <p style="margin-top:24px;font-size:9pt;color:#888;font-style:italic;text-align:center;">
    Document généré par ${esc(input.companyName)} — ${esc(input.dateProposition)}
  </p>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}
