import { PDFDocument, StandardFonts, rgb, PageSizes, PDFPage, PDFFont, RGB } from 'pdf-lib';
import { SuggestionsGenerees, Suggestion } from '@/types';

interface GeneratorOptions {
  suggestions: SuggestionsGenerees;
  clientName?: string;
  logoUrl?: string;
  footerText?: string;
  companyName?: string;
}

// Couleurs du thème
const colors = {
  primary: rgb(0.05, 0.25, 0.45),      // Bleu foncé professionnel
  secondary: rgb(0.1, 0.5, 0.7),        // Bleu moyen
  accent: rgb(0.0, 0.6, 0.5),           // Turquoise
  success: rgb(0.1, 0.6, 0.3),          // Vert
  danger: rgb(0.8, 0.2, 0.2),           // Rouge
  warning: rgb(0.9, 0.6, 0.1),          // Orange
  lightGray: rgb(0.95, 0.95, 0.95),     // Gris très clair
  mediumGray: rgb(0.7, 0.7, 0.7),       // Gris moyen
  darkGray: rgb(0.3, 0.3, 0.3),         // Gris foncé
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
};

// Helpers
function drawRoundedRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RGB,
  borderColor?: RGB
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    borderColor: borderColor || color,
    borderWidth: borderColor ? 1 : 0,
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function wrapTextByWidth(
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  text: string,
  maxLines: number
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  const fits = (s: string) => font.widthOfTextAtSize(s, fontSize) <= maxWidth;

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (fits(candidate)) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      if (lines.length >= maxLines) return lines;
    }

    if (fits(word)) {
      currentLine = word;
      continue;
    }

    let truncated = word;
    while (truncated.length > 1 && !fits(`${truncated}...`)) {
      truncated = truncated.slice(0, -1);
    }
    currentLine = `${truncated}...`;
  }

  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  return lines;
}

function getLigneName(ligne: unknown): string {
  const data: UnknownRecord = isRecord(ligne) ? ligne : {};
  const nom = data.nom;
  const forfait = data.forfait;
  const label = data.label;
  const numero = data.numero;

  if (typeof nom === 'string' && nom) return nom;
  if (typeof forfait === 'string' && forfait) return forfait;
  if (typeof label === 'string' && label) return label;
  if (typeof numero === 'string' && numero) return numero;

  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v) return v;
  }

  return 'Ligne inconnue';
}

function buildRecommendationTitle(suggestion: Suggestion): string {
  const current = getLigneName(suggestion.ligne_actuelle);
  const proposed = suggestion.produit_propose_nom || 'Aucun produit similaire trouvé';
  return `${proposed} à la place de ${current}`;
}

export async function generateComparatifPdf({ 
  suggestions, 
  clientName, 
  logoUrl: _logoUrl, 
  footerText,
  companyName = 'PropoBoost'
}: GeneratorOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const [width, height] = PageSizes.A4;
  const margins = { top: 60, bottom: 60, left: 50, right: 50 };
  const contentWidth = width - margins.left - margins.right;

  const { synthese } = suggestions;
  const isEconomy = synthese.economie_mensuelle >= 0;
  const resolvedClientName =
    typeof clientName === 'string' && clientName.trim() ? clientName.trim() : 'Client';

  // ============================================
  // PAGE 1 - COUVERTURE
  // ============================================
  const page1 = pdfDoc.addPage([width, height]);
  
  // Bandeau supérieur
  drawRoundedRect(page1, 0, height - 120, width, 120, colors.primary);
  
  // Titre principal
  page1.drawText('ANALYSE COMPARATIVE', {
    x: margins.left,
    y: height - 70,
    size: 32,
    font: helveticaBold,
    color: colors.white,
  });
  
  page1.drawText('Optimisation des services telecoms', {
    x: margins.left,
    y: height - 100,
    size: 16,
    font: helvetica,
    color: rgb(0.8, 0.9, 1),
  });

  // Bloc client
  let yPos = height - 180;
  
  drawRoundedRect(page1, margins.left, yPos - 80, contentWidth, 90, colors.lightGray);
  
  page1.drawText('PREPARE POUR', {
    x: margins.left + 20,
    y: yPos - 25,
    size: 10,
    font: helveticaBold,
    color: colors.mediumGray,
  });
  
  page1.drawText(resolvedClientName, {
    x: margins.left + 20,
    y: yPos - 50,
    size: 24,
    font: helveticaBold,
    color: colors.primary,
  });

  const date = new Date().toLocaleDateString('fr-FR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  page1.drawText(`Le ${date}`, {
    x: margins.left + 20,
    y: yPos - 70,
    size: 11,
    font: helveticaOblique,
    color: colors.darkGray,
  });

  // Résumé chiffré - 3 blocs
  yPos = height - 320;
  const blockWidth = (contentWidth - 20) / 3;
  
  // Bloc 1 - Coût actuel
  drawRoundedRect(page1, margins.left, yPos - 80, blockWidth, 90, colors.white, colors.mediumGray);
  page1.drawText('COUT ACTUEL', {
    x: margins.left + 15,
    y: yPos - 25,
    size: 9,
    font: helveticaBold,
    color: colors.mediumGray,
  });
  page1.drawText(`${synthese.cout_total_actuel.toFixed(2)} EUR`, {
    x: margins.left + 15,
    y: yPos - 50,
    size: 22,
    font: helveticaBold,
    color: colors.darkGray,
  });
  page1.drawText('/mois', {
    x: margins.left + 15,
    y: yPos - 70,
    size: 10,
    font: helvetica,
    color: colors.mediumGray,
  });

  // Bloc 2 - Coût proposé
  drawRoundedRect(page1, margins.left + blockWidth + 10, yPos - 80, blockWidth, 90, colors.white, colors.mediumGray);
  page1.drawText('COUT PROPOSE', {
    x: margins.left + blockWidth + 25,
    y: yPos - 25,
    size: 9,
    font: helveticaBold,
    color: colors.mediumGray,
  });
  page1.drawText(`${synthese.cout_total_propose.toFixed(2)} EUR`, {
    x: margins.left + blockWidth + 25,
    y: yPos - 50,
    size: 22,
    font: helveticaBold,
    color: colors.secondary,
  });
  page1.drawText('/mois', {
    x: margins.left + blockWidth + 25,
    y: yPos - 70,
    size: 10,
    font: helvetica,
    color: colors.mediumGray,
  });

  // Bloc 3 - Économie/Surcoût
  const resultColor = isEconomy ? colors.success : colors.warning;
  drawRoundedRect(page1, margins.left + (blockWidth + 10) * 2, yPos - 80, blockWidth, 90, resultColor);
  page1.drawText(isEconomy ? 'ECONOMIE' : 'SURCOUT', {
    x: margins.left + (blockWidth + 10) * 2 + 15,
    y: yPos - 25,
    size: 9,
    font: helveticaBold,
    color: colors.white,
  });
  page1.drawText(`${Math.abs(synthese.economie_mensuelle).toFixed(2)} EUR`, {
    x: margins.left + (blockWidth + 10) * 2 + 15,
    y: yPos - 50,
    size: 22,
    font: helveticaBold,
    color: colors.white,
  });
  page1.drawText('/mois', {
    x: margins.left + (blockWidth + 10) * 2 + 15,
    y: yPos - 70,
    size: 10,
    font: helvetica,
    color: rgb(1, 1, 1),
  });

  // Économie annuelle
  yPos = yPos - 120;
  const annualSaving = Math.abs(synthese.economie_annuelle);
  
  drawRoundedRect(page1, margins.left, yPos - 50, contentWidth, 60, isEconomy ? rgb(0.9, 1, 0.95) : rgb(1, 0.95, 0.9));
  
  page1.drawText(isEconomy ? 'Economie annuelle estimee' : 'Surcout annuel', {
    x: margins.left + 20,
    y: yPos - 25,
    size: 12,
    font: helvetica,
    color: colors.darkGray,
  });
  
  page1.drawText(`${annualSaving.toFixed(2)} EUR/an`, {
    x: width - margins.right - 150,
    y: yPos - 30,
    size: 20,
    font: helveticaBold,
    color: isEconomy ? colors.success : colors.warning,
  });

  // Points clés
  yPos = yPos - 100;
  page1.drawText('POINTS CLES DE CETTE PROPOSITION', {
    x: margins.left,
    y: yPos,
    size: 12,
    font: helveticaBold,
    color: colors.primary,
  });
  
  yPos -= 25;
  const ameliorations = synthese.ameliorations || [];
  const maxAmeliorations = Math.min(ameliorations.length, 5);
  
  for (let i = 0; i < maxAmeliorations; i++) {
    const item = ameliorations[i];
    const lines = wrapText(item, 75);
    
    page1.drawText('-', {
      x: margins.left + 5,
      y: yPos,
      size: 12,
      font: helveticaBold,
      color: colors.success,
    });
    
    for (const line of lines) {
      page1.drawText(line, {
        x: margins.left + 25,
        y: yPos,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPos -= 14;
    }
    yPos -= 6;
  }

  // Footer page 1
  drawRoundedRect(page1, 0, 0, width, 40, colors.lightGray);
  page1.drawText(`Document genere par ${companyName}`, {
    x: margins.left,
    y: 15,
    size: 9,
    font: helvetica,
    color: colors.mediumGray,
  });
  page1.drawText('Page 1', {
    x: width - margins.right - 40,
    y: 15,
    size: 9,
    font: helvetica,
    color: colors.mediumGray,
  });

  // ============================================
  // PAGE 2 - SYNTHÈSE DÉTAILLÉE
  // ============================================
  const page2 = pdfDoc.addPage([width, height]);
  
  // En-tête
  drawRoundedRect(page2, 0, height - 50, width, 50, colors.primary);
  page2.drawText('SYNTHESE DETAILLEE', {
    x: margins.left,
    y: height - 35,
    size: 18,
    font: helveticaBold,
    color: colors.white,
  });

  yPos = height - 90;

  // Tableau comparatif
  page2.drawText('Comparaison des couts', {
    x: margins.left,
    y: yPos,
    size: 14,
    font: helveticaBold,
    color: colors.primary,
  });
  
  yPos -= 30;
  
  // En-tête du tableau
  const colWidths = [180, 100, 100, 100]; // Total = 480, contentWidth = 495
  const tableX = margins.left;
  
  drawRoundedRect(page2, tableX, yPos - 25, contentWidth, 30, colors.primary);
  
  let xOffset = tableX + 10;
  page2.drawText('Description', { x: xOffset, y: yPos - 17, size: 10, font: helveticaBold, color: colors.white });
  xOffset += colWidths[0];
  page2.drawText('Actuel', { x: xOffset, y: yPos - 17, size: 10, font: helveticaBold, color: colors.white });
  xOffset += colWidths[1];
  page2.drawText('Propose', { x: xOffset, y: yPos - 17, size: 10, font: helveticaBold, color: colors.white });
  xOffset += colWidths[2];
  page2.drawText('Difference', { x: xOffset, y: yPos - 17, size: 10, font: helveticaBold, color: colors.white });

  yPos -= 25;

  // Lignes du tableau
  for (let i = 0; i < suggestions.suggestions.length; i++) {
    const suggestion = suggestions.suggestions[i];
    const rowColor = i % 2 === 0 ? colors.white : colors.lightGray;
    const description = buildRecommendationTitle(suggestion);
    const wrapped = wrapText(description, 32);
    const maxLines = 2;
    const lines = wrapped.slice(0, maxLines);
    if (wrapped.length > maxLines) {
      const last = lines[lines.length - 1] || '';
      lines[lines.length - 1] = truncateText(last, 32);
    }
    const rowHeight = Math.max(35, 14 + (lines.length * 12) + 10);
    
    drawRoundedRect(page2, tableX, yPos - rowHeight, contentWidth, rowHeight, rowColor);
    
    xOffset = tableX + 10;
    
    const baseY = yPos - 16;
    for (let li = 0; li < lines.length; li += 1) {
      page2.drawText(lines[li]!, {
        x: xOffset,
        y: baseY - (li * 12),
        size: 9,
        font: helveticaBold,
        color: colors.darkGray,
      });
    }
    
    xOffset += colWidths[0];
    page2.drawText(`${suggestion.prix_actuel.toFixed(2)} EUR`, { 
      x: xOffset, 
      y: yPos - (rowHeight / 2) - 4, 
      size: 10, 
      font: helvetica, 
      color: colors.darkGray 
    });
    
    xOffset += colWidths[1];
    page2.drawText(`${suggestion.prix_propose.toFixed(2)} EUR`, { 
      x: xOffset, 
      y: yPos - (rowHeight / 2) - 4, 
      size: 10, 
      font: helvetica, 
      color: colors.secondary 
    });
    
    xOffset += colWidths[2];
    const diffAmount = suggestion.economie_mensuelle;
    const diffColor = diffAmount >= 0 ? colors.success : colors.warning;
    const diffSign = diffAmount >= 0 ? '-' : '+';
    page2.drawText(`${diffSign}${Math.abs(diffAmount).toFixed(2)} EUR`, { 
      x: xOffset, 
      y: yPos - (rowHeight / 2) - 4, 
      size: 10, 
      font: helveticaBold, 
      color: diffColor 
    });
    
    yPos -= rowHeight;
  }

  // Ligne de total
  drawRoundedRect(page2, tableX, yPos - 35, contentWidth, 35, colors.primary);
  
  xOffset = tableX + 10;
  page2.drawText('TOTAL', { x: xOffset, y: yPos - 22, size: 11, font: helveticaBold, color: colors.white });
  xOffset += colWidths[0];
  page2.drawText(`${synthese.cout_total_actuel.toFixed(2)} EUR`, { x: xOffset, y: yPos - 22, size: 11, font: helveticaBold, color: colors.white });
  xOffset += colWidths[1];
  page2.drawText(`${synthese.cout_total_propose.toFixed(2)} EUR`, { x: xOffset, y: yPos - 22, size: 11, font: helveticaBold, color: colors.white });
  xOffset += colWidths[2];
  const totalDiffSign = isEconomy ? '-' : '+';
  page2.drawText(`${totalDiffSign}${Math.abs(synthese.economie_mensuelle).toFixed(2)} EUR`, { 
    x: xOffset, 
    y: yPos - 22, 
    size: 11, 
    font: helveticaBold, 
    color: colors.white 
  });

  yPos -= 70;

  // Graphique comparatif simplifié (barres horizontales)
  if (yPos > 200) {
    page2.drawText('Visualisation des couts mensuels', {
      x: margins.left,
      y: yPos,
      size: 14,
      font: helveticaBold,
      color: colors.primary,
    });
    
    yPos -= 40;
    
    const maxCost = Math.max(synthese.cout_total_actuel, synthese.cout_total_propose);
    const barMaxWidth = contentWidth - 150; // Plus d'espace pour le texte EUR
    
    // Barre Actuel
    page2.drawText('Actuel', { x: margins.left, y: yPos - 5, size: 10, font: helveticaBold, color: colors.darkGray });
    const bar1Width = (synthese.cout_total_actuel / maxCost) * barMaxWidth;
    drawRoundedRect(page2, margins.left + 60, yPos - 15, bar1Width, 20, colors.mediumGray);
    page2.drawText(`${synthese.cout_total_actuel.toFixed(2)} EUR`, { 
      x: margins.left + 70 + bar1Width, 
      y: yPos - 10, 
      size: 10, 
      font: helveticaBold, 
      color: colors.darkGray 
    });
    
    yPos -= 35;
    
    // Barre Propose
    page2.drawText('Propose', { x: margins.left, y: yPos - 5, size: 10, font: helveticaBold, color: colors.darkGray });
    const bar2Width = (synthese.cout_total_propose / maxCost) * barMaxWidth;
    drawRoundedRect(page2, margins.left + 60, yPos - 15, bar2Width, 20, colors.secondary);
    page2.drawText(`${synthese.cout_total_propose.toFixed(2)} EUR`, { 
      x: margins.left + 70 + bar2Width, 
      y: yPos - 10, 
      size: 10, 
      font: helveticaBold, 
      color: colors.secondary 
    });
  }

  // Footer page 2
  drawRoundedRect(page2, 0, 0, width, 40, colors.lightGray);
  page2.drawText(footerText || `Document genere par ${companyName}`, {
    x: margins.left,
    y: 15,
    size: 9,
    font: helvetica,
    color: colors.mediumGray,
  });
  page2.drawText('Page 2', {
    x: width - margins.right - 40,
    y: 15,
    size: 9,
    font: helvetica,
    color: colors.mediumGray,
  });

  // ============================================
  // PAGES 3+ - DÉTAIL DES SUGGESTIONS
  // ============================================
  let currentPage = pdfDoc.addPage([width, height]);
  let pageNumber = 3;
  yPos = height - 90;

  // En-tête
  const drawPageHeader = (page: PDFPage, title: string) => {
    drawRoundedRect(page, 0, height - 50, width, 50, colors.primary);
    page.drawText(title, {
      x: margins.left,
      y: height - 35,
      size: 18,
      font: helveticaBold,
      color: colors.white,
    });
  };

  const drawPageFooter = (page: PDFPage, pageNum: number) => {
    drawRoundedRect(page, 0, 0, width, 40, colors.lightGray);
    page.drawText(footerText || `Document genere par ${companyName}`, {
      x: margins.left,
      y: 15,
      size: 9,
      font: helvetica,
      color: colors.mediumGray,
    });
    page.drawText(`Page ${pageNum}`, {
      x: width - margins.right - 40,
      y: 15,
      size: 9,
      font: helvetica,
      color: colors.mediumGray,
    });
  };

  drawPageHeader(currentPage, 'DETAIL DES RECOMMANDATIONS');

  for (let i = 0; i < suggestions.suggestions.length; i++) {
    const suggestion = suggestions.suggestions[i];
    const headerHeight = 44;
    const cardHeight = 190;
    
    // Nouvelle page si nécessaire
    if (yPos < cardHeight + margins.bottom + 50) {
      drawPageFooter(currentPage, pageNumber);
      currentPage = pdfDoc.addPage([width, height]);
      pageNumber++;
      drawPageHeader(currentPage, 'DETAIL DES RECOMMANDATIONS (suite)');
      yPos = height - 90;
    }

    // Carte de suggestion
    drawRoundedRect(currentPage, margins.left, yPos - cardHeight, contentWidth, cardHeight, colors.white, colors.mediumGray);
    
    // Numéro et titre
    const suggestionIsEconomy = suggestion.economie_mensuelle >= 0;
    const badgeColor = suggestionIsEconomy ? colors.success : colors.warning;
    
    drawRoundedRect(currentPage, margins.left, yPos - headerHeight, contentWidth, headerHeight, colors.lightGray);
    
    // Badge numéro
    drawRoundedRect(currentPage, margins.left + 10, yPos - 32, 25, 20, colors.primary);
    currentPage.drawText(`${i + 1}`, {
      x: margins.left + 18,
      y: yPos - 27,
      size: 12,
      font: helveticaBold,
      color: colors.white,
    });
    
    // Nom du produit
    const title = buildRecommendationTitle(suggestion);
    const titleX = margins.left + 45;
    const badgeX = width - margins.right - 160;
    const maxTitleWidth = Math.max(120, badgeX - titleX - 10);
    const visibleTitleLines = wrapTextByWidth(helveticaBold, 12, maxTitleWidth, title, 2);
    const titleBaseY = yPos - 20;
    for (let ti = 0; ti < visibleTitleLines.length; ti += 1) {
      currentPage.drawText(visibleTitleLines[ti]!, {
        x: titleX,
        y: titleBaseY - (ti * 14),
        size: 12,
        font: helveticaBold,
        color: colors.primary,
      });
    }
    
    // Badge economie/surcout
    const badgeText = suggestionIsEconomy ? 
      `Economie: ${Math.abs(suggestion.economie_mensuelle).toFixed(2)} EUR/mois` :
      `Surcout: ${Math.abs(suggestion.economie_mensuelle).toFixed(2)} EUR/mois`;
    
    drawRoundedRect(currentPage, width - margins.right - 160, yPos - 32, 150, 20, badgeColor);
    currentPage.drawText(badgeText, {
      x: width - margins.right - 155,
      y: yPos - 27,
      size: 9,
      font: helveticaBold,
      color: colors.white,
    });

    // Détails prix
    let detailY = yPos - (headerHeight + 25);
    
    currentPage.drawText('Prix actuel:', {
      x: margins.left + 20,
      y: detailY,
      size: 10,
      font: helvetica,
      color: colors.mediumGray,
    });
    currentPage.drawText(`${suggestion.prix_actuel.toFixed(2)} EUR/mois`, {
      x: margins.left + 100,
      y: detailY,
      size: 10,
      font: helveticaBold,
      color: colors.darkGray,
    });

    currentPage.drawText('Prix propose:', {
      x: margins.left + 220,
      y: detailY,
      size: 10,
      font: helvetica,
      color: colors.mediumGray,
    });
    currentPage.drawText(`${suggestion.prix_propose.toFixed(2)} EUR/mois`, {
      x: margins.left + 310,
      y: detailY,
      size: 10,
      font: helveticaBold,
      color: colors.secondary,
    });

    // Justification
    detailY -= 30;
    currentPage.drawText('Justification:', {
      x: margins.left + 20,
      y: detailY,
      size: 10,
      font: helveticaBold,
      color: colors.primary,
    });
    
    detailY -= 15;
    const justificationLines = wrapText(suggestion.justification, 85);
    for (const line of justificationLines.slice(0, 6)) {
      currentPage.drawText(line, {
        x: margins.left + 20,
        y: detailY,
        size: 9,
        font: helvetica,
        color: colors.darkGray,
      });
      detailY -= 12;
    }

    yPos -= cardHeight + 15;
  }

  drawPageFooter(currentPage, pageNumber);

  const finalPage = pdfDoc.addPage([width, height]);
  pageNumber += 1;
  drawPageHeader(finalPage, 'SYNTHESE FINALE');

  yPos = height - 90;

  finalPage.drawText('Client', {
    x: margins.left,
    y: yPos,
    size: 10,
    font: helveticaBold,
    color: colors.mediumGray,
  });
  yPos -= 18;

  finalPage.drawText(resolvedClientName, {
    x: margins.left,
    y: yPos,
    size: 18,
    font: helveticaBold,
    color: colors.primary,
  });
  yPos -= 30;

  const analysedCount = suggestions.suggestions.length;
  const econLabel = isEconomy ? 'une economie' : 'un surcout';
  const econMonthly = Math.abs(synthese.economie_mensuelle);
  const econAnnual = Math.abs(synthese.economie_annuelle);
  const summaryText =
    `Apres analyse de ${analysedCount} ligne${analysedCount > 1 ? 's' : ''}, ` +
    `le cout mensuel estime passe de ${synthese.cout_total_actuel.toFixed(2)} EUR a ` +
    `${synthese.cout_total_propose.toFixed(2)} EUR, soit ${econLabel} de ` +
    `${econMonthly.toFixed(2)} EUR par mois (${econAnnual.toFixed(2)} EUR par an).`;

  const summaryLines = wrapText(summaryText, 95);
  for (const line of summaryLines) {
    finalPage.drawText(line, {
      x: margins.left,
      y: yPos,
      size: 10,
      font: helvetica,
      color: colors.darkGray,
    });
    yPos -= 14;
  }
  yPos -= 10;

  finalPage.drawText('Points cles', {
    x: margins.left,
    y: yPos,
    size: 12,
    font: helveticaBold,
    color: colors.primary,
  });
  yPos -= 20;

  const points = synthese.ameliorations && synthese.ameliorations.length > 0
    ? synthese.ameliorations.slice(0, 8)
    : ["Aucun point cle n'a ete fourni dans la synthese."];

  for (const p of points) {
    const lines = wrapText(p, 90);
    finalPage.drawText('-', {
      x: margins.left + 5,
      y: yPos,
      size: 12,
      font: helveticaBold,
      color: colors.accent,
    });
    for (const line of lines) {
      finalPage.drawText(line, {
        x: margins.left + 25,
        y: yPos,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPos -= 14;
    }
    yPos -= 4;
    if (yPos < margins.bottom + 60) break;
  }

  drawPageFooter(finalPage, pageNumber);

  return await pdfDoc.save();
}
