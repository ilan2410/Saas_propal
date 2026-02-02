import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { SuggestionsGenerees } from '@/types';

interface GeneratorOptions {
  suggestions: SuggestionsGenerees;
  clientName?: string;
  logoUrl?: string;
  footerText?: string;
}

export async function generateComparatifPdf({ suggestions, clientName, logoUrl: _logoUrl, footerText }: GeneratorOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const [width, height] = PageSizes.A4;
  const margins = { top: 50, bottom: 50, left: 50, right: 50 };

  const page1 = pdfDoc.addPage([width, height]);
  
  page1.drawText('Analyse Comparative', {
    x: margins.left,
    y: height - 150,
    size: 30,
    font: helveticaBold,
    color: rgb(0, 0, 0.5),
  });
  
  page1.drawText('Optimisation Télécom', {
    x: margins.left,
    y: height - 190,
    size: 24,
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3),
  });

  if (clientName) {
    page1.drawText(`Pour : ${clientName}`, {
      x: margins.left,
      y: height - 300,
      size: 18,
      font: helveticaBold,
    });
  }

  const date = new Date().toLocaleDateString('fr-FR');
  page1.drawText(`Date : ${date}`, {
    x: margins.left,
    y: height - 330,
    size: 14,
    font: helvetica,
  });

  page1.drawText('Proposition générée automatiquement par PropoBoost', {
    x: margins.left,
    y: margins.bottom,
    size: 10,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  const page2 = pdfDoc.addPage([width, height]);
  let y = height - margins.top;

  page2.drawText('Synthèse Exécutive', {
    x: margins.left,
    y,
    size: 20,
    font: helveticaBold,
    color: rgb(0, 0, 0.5),
  });
  y -= 40;

  const { synthese } = suggestions;
  const col1X = margins.left;
  const col2X = margins.left + 150;
  const col3X = margins.left + 300;
  
  page2.drawText('Situation actuelle', { x: col1X, y, size: 12, font: helveticaBold });
  page2.drawText('Situation proposée', { x: col2X, y, size: 12, font: helveticaBold });
  page2.drawText('Différence', { x: col3X, y, size: 12, font: helveticaBold });
  y -= 20;

  page2.drawText(`${synthese.cout_total_actuel.toFixed(2)}€/mois`, { x: col1X, y, size: 12, font: helvetica });
  page2.drawText(`${synthese.cout_total_propose.toFixed(2)}€/mois`, { x: col2X, y, size: 12, font: helvetica });
  
  const diffColor = synthese.economie_mensuelle >= 0 ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0);
  const diffPrefix = synthese.economie_mensuelle >= 0 ? '-' : '+';
  const diffVal = Math.abs(synthese.economie_mensuelle).toFixed(2);
  
  page2.drawText(`${diffPrefix}${diffVal}€/mois`, { x: col3X, y, size: 12, font: helveticaBold, color: diffColor });
  y -= 20;

  page2.drawText(`${(synthese.cout_total_actuel * 12).toFixed(2)}€/an`, { x: col1X, y, size: 12, font: helvetica });
  page2.drawText(`${(synthese.cout_total_propose * 12).toFixed(2)}€/an`, { x: col2X, y, size: 12, font: helvetica });
  page2.drawText(`${diffPrefix}${(Math.abs(synthese.economie_mensuelle) * 12).toFixed(2)}€/an`, { x: col3X, y, size: 12, font: helveticaBold, color: diffColor });
  
  y -= 40;

  page2.drawText('Améliorations principales :', { x: margins.left, y, size: 14, font: helveticaBold });
  y -= 20;
  
  for (const item of (synthese.ameliorations || [])) {
    page2.drawText(`• ${item}`, { x: margins.left + 10, y, size: 10, font: helvetica });
    y -= 15;
  }

  y -= 40;
  page2.drawText('Comparatif Coût Mensuel', { x: margins.left, y, size: 14, font: helveticaBold });
  y -= 100;
  
  const maxVal = Math.max(synthese.cout_total_actuel, synthese.cout_total_propose, 1);
  const barHeight = 100;
  const barWidth = 50;
  
  const h1 = (synthese.cout_total_actuel / maxVal) * barHeight;
  const h2 = (synthese.cout_total_propose / maxVal) * barHeight;
  
  page2.drawRectangle({
    x: margins.left + 50,
    y: y,
    width: barWidth,
    height: h1,
    color: rgb(0.7, 0.7, 0.7),
  });
  page2.drawText('Actuel', { x: margins.left + 50, y: y - 15, size: 10, font: helvetica });
  page2.drawText(`${synthese.cout_total_actuel.toFixed(0)}€`, { x: margins.left + 50, y: y + h1 + 5, size: 9, font: helvetica });
  
  page2.drawRectangle({
    x: margins.left + 150,
    y: y,
    width: barWidth,
    height: h2,
    color: rgb(0.2, 0.4, 0.8),
  });
  page2.drawText('Proposé', { x: margins.left + 150, y: y - 15, size: 10, font: helvetica });
  page2.drawText(`${synthese.cout_total_propose.toFixed(0)}€`, { x: margins.left + 150, y: y + h2 + 5, size: 9, font: helvetica });

  y -= 40;

  let page = pdfDoc.addPage([width, height]);
  y = height - margins.top;
  
  page.drawText('Détail par ligne', { x: margins.left, y, size: 18, font: helveticaBold });
  y -= 30;

  for (const suggestion of suggestions.suggestions) {
    if (y < 150) {
      page = pdfDoc.addPage([width, height]);
      y = height - margins.top;
    }
    
    page.drawText(`Suggestion : ${suggestion.produit_propose_nom}`, { x: margins.left, y, size: 12, font: helveticaBold, color: rgb(0.2, 0.4, 0.8) });
    y -= 20;
    
    const rowY = y;
    page.drawText('Actuel', { x: margins.left, y: rowY, size: 10, font: helveticaBold });
    page.drawText('Proposé', { x: margins.left + 150, y: rowY, size: 10, font: helveticaBold });
    page.drawText('Gain', { x: margins.left + 300, y: rowY, size: 10, font: helveticaBold });
    
    y -= 15;
    
    page.drawText(`${suggestion.prix_actuel}€`, { x: margins.left, y, size: 10, font: helvetica });
    page.drawText(`${suggestion.prix_propose}€`, { x: margins.left + 150, y, size: 10, font: helvetica });
    
    const gainColor = suggestion.economie_mensuelle >= 0 ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0);
    page.drawText(`${Math.abs(suggestion.economie_mensuelle).toFixed(2)}€`, { x: margins.left + 300, y, size: 10, font: helveticaBold, color: gainColor });
    
    y -= 20;
    
    page.drawText('Justification :', { x: margins.left, y, size: 10, font: helveticaBold });
    y -= 12;
    const words = suggestion.justification.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + word).length > 80) {
        page.drawText(line, { x: margins.left, y, size: 9, font: helvetica });
        y -= 10;
        line = '';
      }
      line += word + ' ';
    }
    page.drawText(line, { x: margins.left, y, size: 9, font: helvetica });
    
    y -= 30;
  }

  if (footerText) {
      const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      lastPage.drawText(footerText, {
          x: margins.left,
          y: 30,
          size: 8,
          font: helvetica,
          color: rgb(0.6, 0.6, 0.6),
      });
  }

  return await pdfDoc.save();
}
