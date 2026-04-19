import { SuggestionsGenerees, Suggestion } from '@/types';

interface GeneratorOptions {
  suggestions: SuggestionsGenerees;
  clientName?: string;
  logoUrl?: string;
  footerText?: string;
  companyName?: string;
  primaryColor?: string; // hex #RRGGBB
}

export const DEFAULT_SP_PRIMARY_HEX = '#0D4073';

function escapeHtml(raw: unknown): string {
  const s = String(raw ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLigneName(ligne: unknown): string {
  if (ligne && typeof ligne === 'object' && !Array.isArray(ligne)) {
    const obj = ligne as Record<string, unknown>;
    for (const key of ['nom', 'forfait', 'label', 'numero']) {
      const v = obj[key];
      if (typeof v === 'string' && v) return v;
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v) return v;
    }
  }
  return 'Ligne inconnue';
}

function buildTitle(s: Suggestion): string {
  const current = getLigneName(s.ligne_actuelle);
  const proposed = s.produit_propose_nom || 'Aucun produit similaire trouvé';
  return `${proposed} à la place de ${current}`;
}

function formatEur(n: number): string {
  return `${n.toFixed(2)} €`;
}

/**
 * Génère une "situation proposée" au format Word.
 * On utilise une sortie HTML compatible Microsoft Word (.doc) : simple, portable,
 * sans dépendance supplémentaire. Le fichier s'ouvre directement dans Word/LibreOffice.
 */
export async function generateComparatifWord(options: GeneratorOptions): Promise<Buffer> {
  const {
    suggestions,
    clientName,
    logoUrl,
    footerText,
    companyName = 'PropoBoost',
    primaryColor,
  } = options;

  const primary = primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? primaryColor
    : DEFAULT_SP_PRIMARY_HEX;

  const { synthese } = suggestions;
  const isEconomy = synthese.economie_mensuelle >= 0;
  const safeClient = escapeHtml(clientName && clientName.trim() ? clientName.trim() : 'Client');
  const safeFooter = escapeHtml(footerText || `Document généré par ${companyName}`);
  const safeCompany = escapeHtml(companyName);
  const today = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const rowsHtml = suggestions.suggestions
    .map((s, i) => {
      const diff = s.economie_mensuelle;
      const diffColor = diff >= 0 ? '#16a34a' : '#ea580c';
      const diffSign = diff >= 0 ? '-' : '+';
      const bg = i % 2 === 0 ? '#ffffff' : '#f5f5f5';
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;background:${bg};font-weight:bold;color:#333;">${escapeHtml(buildTitle(s))}</td>
          <td style="padding:8px;border:1px solid #ddd;background:${bg};">${formatEur(s.prix_actuel)}</td>
          <td style="padding:8px;border:1px solid #ddd;background:${bg};color:${primary};">${formatEur(s.prix_propose)}</td>
          <td style="padding:8px;border:1px solid #ddd;background:${bg};color:${diffColor};font-weight:bold;">${diffSign}${formatEur(Math.abs(diff))}</td>
        </tr>`;
    })
    .join('');

  const detailsHtml = suggestions.suggestions
    .map((s, i) => {
      const sE = s.economie_mensuelle >= 0;
      const badgeColor = sE ? '#16a34a' : '#ea580c';
      return `
        <div style="margin-bottom:18px;border:1px solid #ddd;padding:12px;">
          <div style="background:#f0f0f0;padding:8px;margin:-12px -12px 10px -12px;">
            <span style="background:${primary};color:#fff;padding:2px 8px;margin-right:8px;font-weight:bold;">${i + 1}</span>
            <strong style="color:${primary};">${escapeHtml(buildTitle(s))}</strong>
            <span style="float:right;background:${badgeColor};color:#fff;padding:2px 10px;font-size:11px;">
              ${sE ? 'Économie' : 'Surcoût'}&nbsp;:&nbsp;${formatEur(Math.abs(s.economie_mensuelle))}/mois
            </span>
          </div>
          <p style="margin:4px 0;"><strong>Prix actuel :</strong> ${formatEur(s.prix_actuel)}/mois &nbsp; &nbsp;
            <strong>Prix proposé :</strong> <span style="color:${primary};">${formatEur(s.prix_propose)}/mois</span></p>
          <p style="margin:4px 0;"><strong style="color:${primary};">Justification :</strong><br/>${escapeHtml(s.justification || '')}</p>
        </div>`;
    })
    .join('');

  const ameliorationsHtml = (synthese.ameliorations || [])
    .slice(0, 8)
    .map((p) => `<li style="margin:4px 0;">${escapeHtml(p)}</li>`)
    .join('');

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="logo" style="max-height:60px;max-width:160px;float:right;"/>`
    : '';

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <title>Analyse comparative - ${safeClient}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 { size: 21cm 29.7cm; margin: 2cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color:#222; }
    h1 { color:#fff; background:${primary}; padding:18px; margin:0 0 18px 0; font-size:22pt; }
    h2 { color:${primary}; border-bottom:2px solid ${primary}; padding-bottom:4px; margin-top:24px; }
    table { width:100%; border-collapse: collapse; margin:10px 0; }
    th { background:${primary}; color:#fff; padding:8px; text-align:left; border:1px solid ${primary}; }
    .summary-cell { padding:12px; border:1px solid #ccc; text-align:center; }
    .summary-cell .label { font-size:9pt; color:#888; text-transform:uppercase; }
    .summary-cell .value { font-size:18pt; font-weight:bold; color:${primary}; }
    .footer { margin-top:30px; padding-top:10px; border-top:1px solid #ccc; font-size:9pt; color:#666; }
    div.Section1 { page: Section1; }
  </style>
</head>
<body>
<div class="Section1">

  <div>${logoBlock}</div>
  <h1>ANALYSE COMPARATIVE</h1>

  <p style="font-size:9pt;color:#888;text-transform:uppercase;margin-bottom:0;">Préparé pour</p>
  <p style="font-size:20pt;color:${primary};font-weight:bold;margin-top:0;">${safeClient}</p>
  <p style="font-style:italic;color:#555;">Le ${today}</p>

  <table>
    <tr>
      <td class="summary-cell">
        <div class="label">Coût actuel</div>
        <div class="value" style="color:#333;">${formatEur(synthese.cout_total_actuel)}</div>
        <div style="font-size:9pt;color:#888;">/mois</div>
      </td>
      <td class="summary-cell">
        <div class="label">Coût proposé</div>
        <div class="value">${formatEur(synthese.cout_total_propose)}</div>
        <div style="font-size:9pt;color:#888;">/mois</div>
      </td>
      <td class="summary-cell" style="background:${isEconomy ? '#16a34a' : '#ea580c'};color:#fff;">
        <div class="label" style="color:#fff;">${isEconomy ? 'Économie' : 'Surcoût'}</div>
        <div class="value" style="color:#fff;">${formatEur(Math.abs(synthese.economie_mensuelle))}</div>
        <div style="font-size:9pt;">/mois (${formatEur(Math.abs(synthese.economie_annuelle))}/an)</div>
      </td>
    </tr>
  </table>

  ${ameliorationsHtml ? `<h2>Points clés</h2><ul>${ameliorationsHtml}</ul>` : ''}

  <h2>Synthèse détaillée</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Actuel</th>
        <th>Proposé</th>
        <th>Différence</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr>
        <td style="padding:8px;background:${primary};color:#fff;font-weight:bold;">TOTAL</td>
        <td style="padding:8px;background:${primary};color:#fff;font-weight:bold;">${formatEur(synthese.cout_total_actuel)}</td>
        <td style="padding:8px;background:${primary};color:#fff;font-weight:bold;">${formatEur(synthese.cout_total_propose)}</td>
        <td style="padding:8px;background:${primary};color:#fff;font-weight:bold;">${isEconomy ? '-' : '+'}${formatEur(Math.abs(synthese.economie_mensuelle))}</td>
      </tr>
    </tbody>
  </table>

  <h2>Détail des recommandations</h2>
  ${detailsHtml}

  <div class="footer">
    <p>${safeFooter}</p>
    <p style="font-size:8pt;color:#999;">Document généré par ${safeCompany} - ${today}</p>
  </div>

</div>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}
