import type {
  SuggestionsSpCompletes,
  SpBdcOperateurLigne,
  SpBdcMaterielLigne,
  SpBdcInternetLigne,
  SpCadeauLigne,
} from '@/types';
import { DEFAULT_SP_PRIMARY_HEX } from './comparatif-generator';

export interface ComparatifSaSpWordOptions {
  sp: SuggestionsSpCompletes;
  clientName?: string;
  companyName?: string;
  primaryColor?: string;
  logoUrl?: string;
  footerText?: string;
}

function esc(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tableHeaders(cols: string[], primary: string): string {
  return `<tr>${cols.map((c) => `<th style="padding:7px 10px;background:${primary};color:#fff;border:1px solid ${primary};text-align:left;font-size:10pt;">${esc(c)}</th>`).join('')}</tr>`;
}

function tableRow(cells: string[], bg: string): string {
  return `<tr>${cells.map((c) => `<td style="padding:6px 10px;border:1px solid #ddd;background:${bg};font-size:10pt;">${esc(c)}</td>`).join('')}</tr>`;
}

function totalRow(cells: string[], primary: string): string {
  return `<tr>${cells.map((c) => `<td style="padding:7px 10px;background:${primary};color:#fff;border:1px solid ${primary};font-weight:bold;font-size:10pt;">${esc(c)}</td>`).join('')}</tr>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

export async function generateComparatifSaSpWord(options: ComparatifSaSpWordOptions): Promise<Buffer> {
  const {
    sp,
    clientName = 'Client',
    companyName = 'Organisation',
    primaryColor,
    logoUrl,
    footerText,
  } = options;

  const primary = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? primaryColor
    : DEFAULT_SP_PRIMARY_HEX;

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const footer = footerText || `Document généré par ${companyName}`;
  const logoBlock = logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" style="max-height:55px;max-width:150px;float:right;"/>` : '';

  // ── Synthèse ──────────────────────────────────────────────────────────────
  const isEco = sp.sp_est_economie === 'Oui';
  const ecoColor = isEco ? '#16a34a' : '#ea580c';
  const adresseFacturation = formatAddress(sp.sp_adresse_facturation);
  const adresseLivraison = sp.sp_livraison_identique ? 'Identique a la facturation' : formatAddress(sp.sp_adresse_livraison);

  const syntheseRows = [
    ['Total mensuel', sp.sp_total_actuel || '—', sp.sp_total_propose || '—', sp.sp_economie_mensuelle || '—'],
    ['Économie annuelle', '', '', sp.sp_economie_annuelle || '—'],
  ];
  if (sp.sp_total_recurrent) syntheseRows.push(['Récurrent mensuel SP', '', sp.sp_total_recurrent, '']);
  if (sp.sp_total_ponctuel) syntheseRows.push(['Ponctuel total SP', '', sp.sp_total_ponctuel, '']);
  if (sp.sp_fas_total) syntheseRows.push(['FAS total', '', sp.sp_fas_total, '']);
  if (sp.sp_remise_mois_offert) syntheseRows.push(['Remise mois offerts', '', sp.sp_remise_mois_offert, '']);
  if (sp.sp_total_forfaits_mensuel_ht) syntheseRows.push(['Total forfaits mensuel', '', sp.sp_total_forfaits_mensuel_ht, '']);
  if (sp.sp_total_materiel_ht) syntheseRows.push(['Total matériel', '', sp.sp_total_materiel_ht, '']);
  if (sp.sp_total_bdc_operateur_ht) syntheseRows.push(['Total BDC opérateur', '', sp.sp_total_bdc_operateur_ht, '']);
  if (sp.sp_total_bdc_internet_ht) syntheseRows.push(['Total BDC internet', '', sp.sp_total_bdc_internet_ht, '']);
  if (sp.sp_total_bdc_materiel_ht) syntheseRows.push(['Total BDC matériel', '', sp.sp_total_bdc_materiel_ht, '']);
  if (sp.sp_total_cadeaux_ht) syntheseRows.push(['Total cadeaux', '', sp.sp_total_cadeaux_ht, '']);
  if (sp.sp_total_complet) syntheseRows.push(['Total complet SP', '', sp.sp_total_complet, '']);
  if (sp.sp_loyer_mensuel) syntheseRows.push(['Loyer mensuel', '', sp.sp_loyer_mensuel, '']);
  if (sp.sp_loyer_trimestriel) syntheseRows.push(['Loyer trimestriel', '', sp.sp_loyer_trimestriel, '']);
  if (sp.sp_marge) syntheseRows.push(['Marge', '', sp.sp_marge, '']);
  if (sp.sp_duree_mois) syntheseRows.push(['Durée (mois)', '', String(sp.sp_duree_mois), '']);
  if (sp.sp_duree_trimestres) syntheseRows.push(['Durée (trimestres)', '', sp.sp_duree_trimestres, '']);
  if (sp.sp_mois_offerts) syntheseRows.push(['Mois offerts', '', String(sp.sp_mois_offerts), '']);
  if (sp.sp_date_limite_souscription) syntheseRows.push(['Date limite souscription', '', sp.sp_date_limite_souscription, '']);
  if (sp.sp_fournisseur_propose) syntheseRows.push(['Fournisseur proposé', '', sp.sp_fournisseur_propose, '']);
  if (adresseFacturation) syntheseRows.push(['Adresse facturation', '', adresseFacturation, '']);
  if (adresseLivraison) syntheseRows.push(['Adresse livraison', '', adresseLivraison, '']);

  const syntheseHtml = `
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Indicateur', 'Situation Actuelle', 'Situation Proposée', 'Différence'], primary)}
      ${syntheseRows.map((r, i) => tableRow(r, i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
    </table>`;

  const pointsClesHtml = sp.sp_ameliorations
    ? `
    <h2>Points clés</h2>
    <div style="border:1px solid #ddd;background:#f8fafc;padding:12px 14px;line-height:1.5;">${esc(sp.sp_ameliorations)}</div>`
    : '';

  const situationActuelleRows = sp.suggestions.map((suggestion, i) => {
    const current = extractCurrentLineInfo(suggestion.ligne_actuelle);
    return tableRow([
      current.type,
      current.nom,
      current.offre,
      current.fournisseur,
      `${suggestion.prix_actuel.toFixed(2)} €`,
      current.engagement,
      current.site,
      current.details,
    ], i % 2 === 0 ? '#ffffff' : '#f5f7fa');
  }).join('');

  const situationActuelleHtml = sp.suggestions.length > 0 ? `
    <h2>Situation actuelle détaillée</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Type', 'Ligne / Service', 'Offre actuelle', 'Fournisseur actuel', 'Prix actuel', 'Engagement', 'Site / Adresse', 'Détails source'], primary)}
      ${situationActuelleRows}
    </table>` : '';

  const comparatifDetailRows = sp.suggestions.map((suggestion, i) => {
    const current = extractCurrentLineInfo(suggestion.ligne_actuelle);
    return tableRow([
      current.type,
      current.nom,
      current.offre,
      suggestion.produit_propose_nom,
      suggestion.produit_propose_fournisseur || '',
      `${suggestion.prix_actuel.toFixed(2)} €`,
      `${suggestion.prix_propose.toFixed(2)} €`,
      `${suggestion.economie_mensuelle.toFixed(2)} €`,
      suggestion.justification,
    ], i % 2 === 0 ? '#ffffff' : '#f5f7fa');
  }).join('');

  const comparatifDetailHtml = sp.suggestions.length > 0 ? `
    <h2>Comparatif détaillé</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Type', 'Ligne / Service', 'Offre actuelle', 'Produit proposé', 'Fournisseur proposé', 'Prix actuel', 'Prix proposé', 'Économie', 'Justification'], primary)}
      ${comparatifDetailRows}
      ${totalRow(['', 'TOTAL', '', '', '', sp.sp_total_actuel || '', sp.sp_total_propose || '', sp.sp_economie_mensuelle || '', ''], primary)}
    </table>` : '';

  // ── Forfaits ───────────────────────────────────────────────────────────────
  const allForfaits = [...sp.sp_lignes_mobiles, ...sp.sp_lignes_fixes, ...sp.sp_internet];
  const forfaitsHtml = allForfaits.length > 0 ? `
    <h2 style="color:${primary};border-bottom:2px solid ${primary};padding-bottom:4px;margin-top:24px;">Forfaits</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Type', 'Ligne', 'Produit proposé', 'Fournisseur', 'Prix actuel', 'Prix proposé', 'Économie', 'Analyse', 'Justification'], primary)}
      ${allForfaits.map((l, i) => tableRow([
        l.sp_type_ligne, l.sp_nom_ligne, l.sp_produit,
        l.sp_produit_fournisseur || '',
        l.sp_prix_actuel, l.sp_prix_propose, l.sp_economie,
        l.sp_analyse, l.sp_justification,
      ], i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
      ${totalRow(['', 'TOTAL', '', '', sp.sp_total_actuel || '', sp.sp_total_propose || '', sp.sp_economie_mensuelle || '', '', ''], primary)}
    </table>` : '';

  // ── Matériel ──────────────────────────────────────────────────────────────
  const materielDetail = sp.sp_materiel_detail ?? [];
  const materielHtml = materielDetail.length > 0 ? `
    <h2 style="color:${primary};border-bottom:2px solid ${primary};padding-bottom:4px;margin-top:24px;">Matériel</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Équipement', 'Réf.', 'Fournisseur', 'Qté', 'Prix HT', 'Fréquence', 'Commentaire'], primary)}
      ${materielDetail.map((m, i) => tableRow([
        m.sp_matd_nom, m.sp_matd_ref || '',
        m.sp_matd_fournisseur || '',
        m.sp_matd_quantite,
        m.sp_matd_prix_ht,
        m.sp_matd_frequence,
        m.sp_matd_commentaire,
      ], i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
      ${sp.sp_total_materiel_ht ? totalRow(['TOTAL', '', '', '', sp.sp_total_materiel_ht, '', ''], primary) : ''}
    </table>` : '';

  // ── BDC Opérateur ─────────────────────────────────────────────────────────
  const bdcOp = sp.sp_bdc_operateur_table as SpBdcOperateurLigne[] | undefined;
  const bdcOpHtml = bdcOp && bdcOp.length > 0 ? `
    <h2 style="color:${primary};border-bottom:2px solid ${primary};padding-bottom:4px;margin-top:24px;">BDC Opérateur</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Type', 'Ligne', 'Produit', 'Fournisseur', 'Prix actuel', 'Prix mensuel HT', 'Économie'], primary)}
      ${bdcOp.map((l, i) => tableRow([
        l.sp_bdc_op_type, l.sp_bdc_op_nom,
        l.sp_bdc_op_produit || '', l.sp_bdc_op_fournisseur || '',
        l.sp_bdc_op_prix_actuel || '',
        l.sp_bdc_op_prix_mensuel_ht,
        l.sp_bdc_op_economie || '',
      ], i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
      ${sp.sp_total_bdc_operateur_ht ? totalRow(['', 'TOTAL', '', '', '', sp.sp_total_bdc_operateur_ht, ''], primary) : ''}
    </table>` : '';

  // ── BDC Internet ──────────────────────────────────────────────────────────
  const bdcInternet = sp.sp_bdc_internet_table as SpBdcInternetLigne[] | undefined;
  const bdcInternetHtml = bdcInternet && bdcInternet.length > 0 ? `
    <h2 style="color:${primary};border-bottom:2px solid ${primary};padding-bottom:4px;margin-top:24px;">BDC Internet</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Ligne', 'Produit', 'Fournisseur', 'Prix actuel', 'Prix mensuel HT'], primary)}
      ${bdcInternet.map((l, i) => tableRow([
        l.sp_bdc_int_nom,
        l.sp_bdc_int_produit || '',
        l.sp_bdc_int_fournisseur || '',
        l.sp_bdc_int_prix_actuel || '',
        l.sp_bdc_int_prix_mensuel_ht,
      ], i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
      ${sp.sp_total_bdc_internet_ht ? totalRow(['TOTAL', '', '', '', sp.sp_total_bdc_internet_ht], primary) : ''}
    </table>` : '';

  // ── BDC Matériel ──────────────────────────────────────────────────────────
  const bdcMat = sp.sp_bdc_materiel_table as SpBdcMaterielLigne[] | undefined;
  const bdcMatHtml = bdcMat && bdcMat.length > 0 ? `
    <h2 style="color:${primary};border-bottom:2px solid ${primary};padding-bottom:4px;margin-top:24px;">BDC Matériel</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Équipement', 'Réf.', 'Fournisseur', 'Prix HT', 'Fréquence'], primary)}
      ${bdcMat.map((m, i) => tableRow([
        m.sp_bdc_mat_nom, m.sp_bdc_mat_ref || '',
        m.sp_bdc_mat_fournisseur || '',
        m.sp_bdc_mat_prix_ht, m.sp_bdc_mat_frequence,
      ], i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
      ${sp.sp_total_bdc_materiel_ht ? totalRow(['TOTAL', '', '', sp.sp_total_bdc_materiel_ht, ''], primary) : ''}
    </table>` : '';

  // ── Cadeaux ───────────────────────────────────────────────────────────────
  const cadeaux = sp.sp_cadeaux_table as SpCadeauLigne[] | undefined;
  const cadeauxHtml = cadeaux && cadeaux.length > 0 ? `
    <h2 style="color:${primary};border-bottom:2px solid ${primary};padding-bottom:4px;margin-top:24px;">Cadeaux</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      ${tableHeaders(['Cadeau', 'Réf.', 'Valeur HT'], primary)}
      ${cadeaux.map((m, i) => tableRow([
        m.sp_cadeau_nom,
        m.sp_cadeau_ref || '',
        m.sp_cadeau_valeur_ht,
      ], i % 2 === 0 ? '#ffffff' : '#f5f7fa')).join('')}
      ${sp.sp_total_cadeaux_ht ? totalRow(['TOTAL', '', sp.sp_total_cadeaux_ht], primary) : ''}
    </table>` : '';

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <title>Comparatif SA/SP - ${esc(clientName)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
  <style>
    @page Section1 { size:21cm 29.7cm; margin:2cm; }
    body { font-family:Calibri,Arial,sans-serif; font-size:11pt; color:#222; }
    h1 { color:#fff; background:${primary}; padding:16px 20px; margin:0 0 18px; font-size:20pt; }
    h2 { color:${primary}; border-bottom:2px solid ${primary}; padding-bottom:4px; margin-top:24px; font-size:14pt; }
    table { width:100%; border-collapse:collapse; margin:10px 0; }
    .footer { margin-top:30px; padding-top:10px; border-top:1px solid #ccc; font-size:9pt; color:#666; }
    div.Section1 { page:Section1; }
  </style>
</head>
<body>
<div class="Section1">
  <div>${logoBlock}</div>
  <h1>COMPARATIF SA / SP</h1>

  <p style="font-size:9pt;color:#888;text-transform:uppercase;margin-bottom:0;">Préparé pour</p>
  <p style="font-size:20pt;color:${primary};font-weight:bold;margin-top:0;">${esc(clientName)}</p>
  <p style="font-style:italic;color:#555;margin-top:0;">Le ${today}</p>

  <div style="display:flex;gap:12px;margin-bottom:18px;">
    <div style="flex:1;padding:14px;border:1px solid #ddd;text-align:center;">
      <div style="font-size:9pt;color:#888;text-transform:uppercase;">Coût actuel</div>
      <div style="font-size:18pt;font-weight:bold;color:#333;">${esc(sp.sp_total_actuel || '—')}</div>
      <div style="font-size:9pt;color:#888;">/mois</div>
    </div>
    <div style="flex:1;padding:14px;border:1px solid #ddd;text-align:center;">
      <div style="font-size:9pt;color:#888;text-transform:uppercase;">Coût proposé</div>
      <div style="font-size:18pt;font-weight:bold;color:${primary};">${esc(sp.sp_total_propose || '—')}</div>
      <div style="font-size:9pt;color:#888;">/mois</div>
    </div>
    <div style="flex:1;padding:14px;border:1px solid ${ecoColor};background:${ecoColor};text-align:center;color:#fff;">
      <div style="font-size:9pt;text-transform:uppercase;">${isEco ? 'Économie' : 'Surcoût'}</div>
      <div style="font-size:18pt;font-weight:bold;">${esc(sp.sp_economie_mensuelle || '—')}</div>
      <div style="font-size:9pt;">/mois (${esc(sp.sp_economie_annuelle || '—')}/an)</div>
    </div>
  </div>

  <h2>Synthèse</h2>
  ${syntheseHtml}
  ${pointsClesHtml}
  ${situationActuelleHtml}
  ${comparatifDetailHtml}
  ${forfaitsHtml}
  ${materielHtml}
  ${bdcOpHtml}
  ${bdcInternetHtml}
  ${bdcMatHtml}
  ${cadeauxHtml}

  <div class="footer">
    <p>${esc(footer)}</p>
    <p style="font-size:8pt;color:#999;">Document généré par ${esc(companyName)} - ${today}</p>
  </div>
</div>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}
