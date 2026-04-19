import { PDFDocument, StandardFonts, rgb, PageSizes, PDFPage, PDFFont, RGB } from 'pdf-lib';
import { SuggestionsGenerees, Suggestion, SpLogoSize, SpLogoPosition, SpTextAlignment } from '@/types';

interface GeneratorOptions {
  suggestions: SuggestionsGenerees;
  clientName?: string;
  logoUrl?: string;
  footerText?: string;
  companyName?: string;
  primaryColor?: string; // hex #RRGGBB
  logoSize?: SpLogoSize;
  logoPosition?: SpLogoPosition;
  titleText?: string;
  titleSize?: number;
  titleColor?: string;
  subtitleText?: string;
  subtitleSize?: number;
  subtitleColor?: string;
  titleAlignment?: SpTextAlignment;
  subtitleAlignment?: SpTextAlignment;
}

// Couleur primaire par défaut (équivalent de rgb(0.05, 0.25, 0.45))
export const DEFAULT_SP_PRIMARY_HEX = '#0D4073';
export const DEFAULT_SP_FOOTER_PREFIX = 'Document généré par';
export const DEFAULT_SP_TITLE_TEXT = 'ANALYSE COMPARATIVE';
export const DEFAULT_SP_SUBTITLE_TEXT = 'Optimisation des services telecoms';
export const DEFAULT_SP_TITLE_SIZE = 32;
export const DEFAULT_SP_SUBTITLE_SIZE = 16;

function logoDims(size: SpLogoSize | undefined): { maxW: number; maxH: number } {
  switch (size) {
    case 'small':
      return { maxW: 80, maxH: 40 };
    case 'large':
      return { maxW: 200, maxH: 100 };
    case 'medium':
    default:
      return { maxW: 140, maxH: 70 };
  }
}

function fitLogo(
  img: { width: number; height: number },
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const ratio = img.width / img.height;
  let h = maxH;
  let w = h * ratio;
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  return { w, h };
}

function hexToRgb(hex: string): RGB {
  try {
    const h = hex.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('invalid');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return rgb(r, g, b);
  } catch {
    return rgb(0.05, 0.25, 0.45);
  }
}

function lightenRgb(color: RGB, factor: number): RGB {
  const r = Math.min(1, color.red + (1 - color.red) * factor);
  const g = Math.min(1, color.green + (1 - color.green) * factor);
  const b = Math.min(1, color.blue + (1 - color.blue) * factor);
  return rgb(r, g, b);
}

// Couleurs du thème (secondary/accent dérivés de primary pour rester cohérents)
function buildColors(primaryHex?: string) {
  const primary = hexToRgb(primaryHex || DEFAULT_SP_PRIMARY_HEX);
  const secondary = lightenRgb(primary, 0.35);
  const accent = lightenRgb(primary, 0.2);
  return {
    primary,
    secondary,
    accent,
    success: rgb(0.1, 0.6, 0.3),          // Vert
    danger: rgb(0.8, 0.2, 0.2),           // Rouge
    warning: rgb(0.9, 0.6, 0.1),          // Orange
    lightGray: rgb(0.95, 0.95, 0.95),     // Gris très clair
    mediumGray: rgb(0.7, 0.7, 0.7),       // Gris moyen
    darkGray: rgb(0.3, 0.3, 0.3),         // Gris foncé
    white: rgb(1, 1, 1),
    black: rgb(0, 0, 0),
    chartActuel: rgb(0.6, 0.6, 0.65),     // Gris bleuté pour actuel
    chartPropose: rgb(0.18, 0.55, 0.78),  // Bleu vif pour proposé
    chartGrid: rgb(0.85, 0.85, 0.85),     // Gris clair pour la grille
  };
}

type Colors = ReturnType<typeof buildColors>;

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

function sanitizePdfText(text: string): string {
  const s = String(text ?? '');
  return s
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u21D2/g, '=>')
    .replace(/\u21D0/g, '<=')
    .replace(/[\u2194\u21D4]/g, '<->')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const normalized = sanitizePdfText(text);
  const words = normalized.split(' ');
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
  const normalized = sanitizePdfText(text);
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
  const proposed = suggestion.produit_propose_nom || 'Aucun produit similaire trouve';
  return `${proposed} a la place de ${current}`;
}

// Fonction pour dessiner le graphique moderne avec barres verticales
function drawModernChart(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  actuel: number,
  propose: number,
  isEconomy: boolean,
  helvetica: PDFFont,
  helveticaBold: PDFFont,
  colors: Colors
) {
  const chartPadding = { top: 45, bottom: 55, left: 55, right: 130 };
  const chartWidth = width - chartPadding.left - chartPadding.right;
  const chartHeight = height - chartPadding.top - chartPadding.bottom;
  const chartX = x + chartPadding.left;
  const chartY = y + chartPadding.bottom;

  // Fond du graphique avec bordure
  drawRoundedRect(page, x, y, width, height, colors.white, colors.mediumGray);
  
  // Titre du graphique
  page.drawText('Comparaison des couts mensuels', {
    x: x + 15,
    y: y + height - 28,
    size: 13,
    font: helveticaBold,
    color: colors.primary,
  });

  // Calcul des valeurs
  const maxValue = Math.max(actuel, propose) * 1.15;
  const barWidth = 55;
  const bar1CenterX = chartX + chartWidth * 0.3;
  const bar2CenterX = chartX + chartWidth * 0.7;
  
  // Lignes de grille horizontales et valeurs Y
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const lineY = chartY + (chartHeight / gridLines) * i;
    const value = (maxValue / gridLines) * i;
    
    // Ligne de grille pointillée
    if (i > 0) {
      page.drawLine({
        start: { x: chartX, y: lineY },
        end: { x: chartX + chartWidth, y: lineY },
        thickness: 0.5,
        color: colors.chartGrid,
        dashArray: [3, 3],
      });
    }
    
    // Valeur sur l'axe Y
    const valueText = `${value.toFixed(0)}`;
    page.drawText(valueText, {
      x: chartX - 40,
      y: lineY - 4,
      size: 9,
      font: helvetica,
      color: colors.darkGray,
    });
  }

  // Label axe Y
  page.drawText('EUR', {
    x: chartX - 45,
    y: chartY + chartHeight + 8,
    size: 8,
    font: helveticaBold,
    color: colors.mediumGray,
  });

  // Axe X (ligne horizontale de base)
  page.drawLine({
    start: { x: chartX, y: chartY },
    end: { x: chartX + chartWidth, y: chartY },
    thickness: 1.5,
    color: colors.darkGray,
  });

  // ===== BARRE "ACTUEL" =====
  const bar1Height = (actuel / maxValue) * chartHeight;
  const bar1X = bar1CenterX - barWidth / 2;
  
  // Ombre de la barre (décalée)
  drawRoundedRect(page, bar1X + 4, chartY + 2, barWidth, bar1Height - 4, rgb(0.45, 0.45, 0.5));
  
  // Barre principale avec dégradé simulé (bande plus claire sur le côté)
  drawRoundedRect(page, bar1X, chartY, barWidth, bar1Height, colors.chartActuel);
  drawRoundedRect(page, bar1X, chartY, 8, bar1Height, rgb(0.7, 0.7, 0.75));
  
  // Valeur au-dessus de la barre
  const actuelText = `${actuel.toFixed(2)} EUR`;
  const actuelTextWidth = helveticaBold.widthOfTextAtSize(actuelText, 11);
  page.drawText(actuelText, {
    x: bar1CenterX - actuelTextWidth / 2,
    y: chartY + bar1Height + 10,
    size: 11,
    font: helveticaBold,
    color: colors.darkGray,
  });
  
  // Label sous la barre
  page.drawText('ACTUEL', {
    x: bar1CenterX - 22,
    y: chartY - 25,
    size: 10,
    font: helveticaBold,
    color: colors.darkGray,
  });

  // ===== BARRE "PROPOSE" =====
  const bar2Height = (propose / maxValue) * chartHeight;
  const bar2X = bar2CenterX - barWidth / 2;
  
  // Ombre de la barre
  drawRoundedRect(page, bar2X + 4, chartY + 2, barWidth, bar2Height - 4, rgb(0.08, 0.35, 0.55));
  
  // Barre principale
  drawRoundedRect(page, bar2X, chartY, barWidth, bar2Height, colors.chartPropose);
  drawRoundedRect(page, bar2X, chartY, 8, bar2Height, rgb(0.25, 0.65, 0.88));
  
  // Valeur au-dessus de la barre
  const proposeText = `${propose.toFixed(2)} EUR`;
  const proposeTextWidth = helveticaBold.widthOfTextAtSize(proposeText, 11);
  page.drawText(proposeText, {
    x: bar2CenterX - proposeTextWidth / 2,
    y: chartY + bar2Height + 10,
    size: 11,
    font: helveticaBold,
    color: colors.secondary,
  });
  
  // Label sous la barre
  page.drawText('PROPOSE', {
    x: bar2CenterX - 26,
    y: chartY - 25,
    size: 10,
    font: helveticaBold,
    color: colors.secondary,
  });

  // ===== INDICATEUR DE DIFFÉRENCE (panneau à droite) =====
  const diff = actuel - propose;
  const diffPercent = actuel > 0 ? (Math.abs(diff) / actuel) * 100 : 0;
  const diffColor = isEconomy ? colors.success : colors.warning;
  const diffSign = isEconomy ? '-' : '+';
  
  // Boîte de différence
  const diffBoxX = x + width - 115;
  const diffBoxY = y + height - 95;
  const diffBoxWidth = 100;
  const diffBoxHeight = 70;
  
  // Fond de la boîte
  drawRoundedRect(page, diffBoxX, diffBoxY, diffBoxWidth, diffBoxHeight, diffColor);
  
  // Titre de la boîte
  page.drawText(isEconomy ? 'ECONOMIE' : 'SURCOUT', {
    x: diffBoxX + 12,
    y: diffBoxY + diffBoxHeight - 18,
    size: 9,
    font: helveticaBold,
    color: colors.white,
  });
  
  // Pourcentage
  page.drawText(`${diffSign}${diffPercent.toFixed(1)}%`, {
    x: diffBoxX + 12,
    y: diffBoxY + diffBoxHeight - 42,
    size: 20,
    font: helveticaBold,
    color: colors.white,
  });
  
  // Montant
  page.drawText(`${diffSign}${Math.abs(diff).toFixed(2)} EUR`, {
    x: diffBoxX + 12,
    y: diffBoxY + 10,
    size: 9,
    font: helvetica,
    color: colors.white,
  });

  // ===== LÉGENDE EN BAS =====
  const legendY = y + 12;
  
  // Légende Actuel
  drawRoundedRect(page, x + 20, legendY - 3, 14, 14, colors.chartActuel);
  page.drawText('Cout mensuel actuel', {
    x: x + 40,
    y: legendY,
    size: 9,
    font: helvetica,
    color: colors.darkGray,
  });
  
  // Légende Proposé
  drawRoundedRect(page, x + 160, legendY - 3, 14, 14, colors.chartPropose);
  page.drawText('Cout mensuel propose', {
    x: x + 180,
    y: legendY,
    size: 9,
    font: helvetica,
    color: colors.darkGray,
  });
}

export async function generateComparatifPdf({ 
  suggestions, 
  clientName, 
  logoUrl, 
  footerText,
  companyName = 'PropoBoost',
  primaryColor,
  logoSize,
  logoPosition,
  titleText,
  titleSize,
  titleColor,
  subtitleText,
  subtitleSize,
  subtitleColor,
  titleAlignment,
  subtitleAlignment,
}: GeneratorOptions): Promise<Uint8Array> {
  const colors = buildColors(primaryColor);
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Embed optional logo (png/jpg)
  let embeddedLogo: { image: Awaited<ReturnType<typeof pdfDoc.embedPng>>; width: number; height: number } | null = null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const buf = await res.arrayBuffer();
        const isJpg = ct.includes('jpeg') || ct.includes('jpg');
        const img = isJpg ? await pdfDoc.embedJpg(buf) : await pdfDoc.embedPng(buf);
        embeddedLogo = { image: img, width: img.width, height: img.height };
      }
    } catch (e) {
      console.warn('⚠️ Logo SP non chargé:', e);
    }
  }

  const [width, height] = PageSizes.A4;
  const margins = { top: 60, bottom: 60, left: 50, right: 50 };
  const contentWidth = width - margins.left - margins.right;

  const { synthese } = suggestions;
  const isEconomy = synthese.economie_mensuelle >= 0;
  const resolvedClientName =
    typeof clientName === 'string' && clientName.trim() ? clientName.trim() : 'Client';
  const safeClientName = sanitizePdfText(resolvedClientName) || 'Client';

  // Résolution des valeurs de personnalisation
  const resolvedTitleText = sanitizePdfText(titleText || DEFAULT_SP_TITLE_TEXT) || DEFAULT_SP_TITLE_TEXT;
  const resolvedSubtitleText = subtitleText !== undefined
    ? sanitizePdfText(subtitleText)
    : DEFAULT_SP_SUBTITLE_TEXT;
  const resolvedTitleSize = Math.max(10, Math.min(60, titleSize || DEFAULT_SP_TITLE_SIZE));
  const resolvedSubtitleSize = Math.max(8, Math.min(40, subtitleSize || DEFAULT_SP_SUBTITLE_SIZE));
  const resolvedTitleColor = titleColor ? hexToRgb(titleColor) : colors.white;
  const resolvedSubtitleColor = subtitleColor ? hexToRgb(subtitleColor) : rgb(0.8, 0.9, 1);
  const resolvedLogoPosition: SpLogoPosition = logoPosition || 'right';
  const resolvedTitleAlignment: SpTextAlignment = titleAlignment || 'left';
  const resolvedSubtitleAlignment: SpTextAlignment = subtitleAlignment || resolvedTitleAlignment;
  const resolvedFooterText = footerText || `Document genere par ${companyName}`;

  // ============================================
  // PAGE 1 - COUVERTURE
  // ============================================
  const page1 = pdfDoc.addPage([width, height]);

  // Dimensions logo
  const { maxW: logoMaxW, maxH: logoMaxH } = logoDims(logoSize);
  const logoDraw = embeddedLogo ? fitLogo(embeddedLogo, logoMaxW, logoMaxH) : { w: 0, h: 0 };

  // Hauteur du bandeau adaptative selon la position et la taille du logo
  const titleBlockHeight = resolvedTitleSize + 8 + (resolvedSubtitleText ? resolvedSubtitleSize : 0);
  const sideBannerHeight = Math.max(120, logoDraw.h + 50, titleBlockHeight + 50);
  const stackedBannerHeight = Math.max(
    140,
    logoDraw.h + titleBlockHeight + 50
  );
  const bannerHeight =
    embeddedLogo && (resolvedLogoPosition === 'above' || resolvedLogoPosition === 'below' || resolvedLogoPosition === 'center')
      ? stackedBannerHeight
      : sideBannerHeight;
  const bannerTop = height;
  const bannerBottom = height - bannerHeight;

  // Bandeau supérieur
  drawRoundedRect(page1, 0, bannerBottom, width, bannerHeight, colors.primary);

  // Calcul des positions (titre + sous-titre + logo)
  const titleWidth = helveticaBold.widthOfTextAtSize(resolvedTitleText, resolvedTitleSize);
  const subtitleWidth = resolvedSubtitleText
    ? helvetica.widthOfTextAtSize(resolvedSubtitleText, resolvedSubtitleSize)
    : 0;

  let titleX = margins.left;
  let titleY = bannerTop - 50 - resolvedTitleSize * 0.3;
  let subtitleX = margins.left;
  let subtitleY = titleY - (resolvedTitleSize * 0.4) - 12;
  let logoX = width - margins.right - logoDraw.w;
  let logoY = bannerTop - 25 - logoDraw.h;

  if (embeddedLogo) {
    switch (resolvedLogoPosition) {
      case 'left': {
        logoX = margins.left;
        logoY = bannerTop - (bannerHeight / 2) - (logoDraw.h / 2);
        titleX = margins.left + logoDraw.w + 20;
        subtitleX = titleX;
        break;
      }
      case 'center': {
        logoX = (width - logoDraw.w) / 2;
        logoY = bannerTop - 20 - logoDraw.h;
        titleX = (width - titleWidth) / 2;
        titleY = logoY - 20 - resolvedTitleSize * 0.3;
        subtitleX = (width - subtitleWidth) / 2;
        subtitleY = titleY - (resolvedTitleSize * 0.4) - 10;
        break;
      }
      case 'above': {
        logoX = margins.left;
        logoY = bannerTop - 20 - logoDraw.h;
        titleY = logoY - 20 - resolvedTitleSize * 0.3;
        subtitleY = titleY - (resolvedTitleSize * 0.4) - 10;
        break;
      }
      case 'below': {
        titleY = bannerTop - 40 - resolvedTitleSize * 0.3;
        subtitleY = titleY - (resolvedTitleSize * 0.4) - 10;
        logoX = margins.left;
        logoY = subtitleY - 15 - logoDraw.h;
        break;
      }
      case 'right':
      default: {
        logoX = width - margins.right - logoDraw.w;
        logoY = bannerTop - (bannerHeight / 2) - (logoDraw.h / 2);
        break;
      }
    }

    page1.drawImage(embeddedLogo.image, {
      x: logoX,
      y: logoY,
      width: logoDraw.w,
      height: logoDraw.h,
    });
  }

  // Application de l'alignement horizontal demandé pour le titre et le sous-titre
  // On détermine la zone de texte disponible selon la position du logo, puis on
  // recalcule titleX/subtitleX en fonction de l'alignement choisi.
  {
    let textLeft = margins.left;
    let textRight = width - margins.right;
    if (embeddedLogo) {
      if (resolvedLogoPosition === 'left') {
        textLeft = logoX + logoDraw.w + 20;
      } else if (resolvedLogoPosition === 'right') {
        textRight = logoX - 20;
      }
    }
    const regionWidth = Math.max(0, textRight - textLeft);
    const applyAlign = (textW: number, align: SpTextAlignment): number => {
      if (align === 'center') return textLeft + Math.max(0, (regionWidth - textW) / 2);
      if (align === 'right') return textRight - textW;
      return textLeft;
    };
    titleX = applyAlign(titleWidth, resolvedTitleAlignment);
    subtitleX = applyAlign(subtitleWidth, resolvedSubtitleAlignment);
  }

  // Titre principal
  page1.drawText(resolvedTitleText, {
    x: titleX,
    y: titleY,
    size: resolvedTitleSize,
    font: helveticaBold,
    color: resolvedTitleColor,
  });

  if (resolvedSubtitleText) {
    page1.drawText(resolvedSubtitleText, {
      x: subtitleX,
      y: subtitleY,
      size: resolvedSubtitleSize,
      font: helvetica,
      color: resolvedSubtitleColor,
    });
  }

  // Bloc client
  let yPos = bannerBottom - 60;
  
  drawRoundedRect(page1, margins.left, yPos - 80, contentWidth, 90, colors.lightGray);
  
  page1.drawText('PREPARE POUR', {
    x: margins.left + 20,
    y: yPos - 25,
    size: 10,
    font: helveticaBold,
    color: colors.mediumGray,
  });
  
  page1.drawText(safeClientName, {
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

  // Résumé chiffré - 3 blocs (positionné dynamiquement sous le bloc client)
  yPos = bannerBottom - 200;
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

  // Footer page 1 (identique aux autres pages)
  drawRoundedRect(page1, 0, 0, width, 40, colors.lightGray);
  page1.drawText(sanitizePdfText(resolvedFooterText), {
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
  page2.drawText('Detail des lignes', {
    x: margins.left,
    y: yPos,
    size: 14,
    font: helveticaBold,
    color: colors.primary,
  });
  
  yPos -= 30;
  
  // En-tête du tableau
  const colWidths = [180, 100, 100, 100];
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

  yPos -= 55;

  // Graphique moderne
  if (yPos > 260) {
    const chartHeight = 210;
    drawModernChart(
      page2,
      margins.left,
      yPos - chartHeight,
      contentWidth,
      chartHeight,
      synthese.cout_total_actuel,
      synthese.cout_total_propose,
      isEconomy,
      helvetica,
      helveticaBold,
      colors
    );
  }

  // Footer page 2
  drawRoundedRect(page2, 0, 0, width, 40, colors.lightGray);
  page2.drawText(sanitizePdfText(footerText || `Document genere par ${companyName}`), {
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
    page.drawText(sanitizePdfText(footerText || `Document genere par ${companyName}`), {
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
    
    if (yPos < cardHeight + margins.bottom + 50) {
      drawPageFooter(currentPage, pageNumber);
      currentPage = pdfDoc.addPage([width, height]);
      pageNumber++;
      drawPageHeader(currentPage, 'DETAIL DES RECOMMANDATIONS (suite)');
      yPos = height - 90;
    }

    drawRoundedRect(currentPage, margins.left, yPos - cardHeight, contentWidth, cardHeight, colors.white, colors.mediumGray);
    
    const suggestionIsEconomy = suggestion.economie_mensuelle >= 0;
    const badgeColor = suggestionIsEconomy ? colors.success : colors.warning;
    
    drawRoundedRect(currentPage, margins.left, yPos - headerHeight, contentWidth, headerHeight, colors.lightGray);
    
    drawRoundedRect(currentPage, margins.left + 10, yPos - 32, 25, 20, colors.primary);
    currentPage.drawText(`${i + 1}`, {
      x: margins.left + 18,
      y: yPos - 27,
      size: 12,
      font: helveticaBold,
      color: colors.white,
    });
    
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
    
    const badgeText = suggestionIsEconomy ? 
      `Economie: ${Math.abs(suggestion.economie_mensuelle).toFixed(2)} EUR/mois` :
      `Surcout: ${Math.abs(suggestion.economie_mensuelle).toFixed(2)} EUR/mois`;
    
    drawRoundedRect(currentPage, width - margins.right - 160, yPos - 32, 150, 20, badgeColor);
    currentPage.drawText(sanitizePdfText(badgeText), {
      x: width - margins.right - 155,
      y: yPos - 27,
      size: 9,
      font: helveticaBold,
      color: colors.white,
    });

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

  // ============================================
  // PAGE FINALE - SYNTHÈSE
  // ============================================
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

  finalPage.drawText(safeClientName, {
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