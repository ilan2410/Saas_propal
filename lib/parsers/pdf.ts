// Parser PDF
import fs from 'fs';

type PdfParseResult = {
  text: string;
  numpages: number;
  info?: unknown;
};

type PdfParseFn = (data: Buffer) => Promise<PdfParseResult>;

async function getPdfParse(): Promise<PdfParseFn> {
  const mod: unknown = await import('pdf-parse');
  const maybeFn =
    (mod as { default?: unknown } | null | undefined)?.default ?? mod;

  if (typeof maybeFn !== 'function') {
    throw new Error('pdf-parse: export introuvable');
  }

  return maybeFn as PdfParseFn;
}

/**
 * Parse un fichier PDF et extrait le texte
 * @param filePath - Chemin du fichier PDF
 * @returns Texte extrait et métadonnées
 */
export async function parsePDF(filePath: string): Promise<{
  text: string;
  pages: number;
  metadata: unknown;
}> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfParse = await getPdfParse();
    const pdfData = await pdfParse(dataBuffer);

    return {
      text: pdfData.text,
      pages: pdfData.numpages,
      metadata: pdfData.info,
    };
  } catch (error) {
    console.error('Erreur parsing PDF:', error);
    throw new Error(
      `Échec du parsing PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Parse un PDF et retourne un preview HTML
 * @param filePath - Chemin du fichier PDF
 * @param maxLength - Longueur maximale du texte (caractères)
 * @returns HTML preview
 */
export async function getPDFPreview(
  filePath: string,
  maxLength: number = 5000
): Promise<string> {
  try {
    const { text } = await parsePDF(filePath);
    const truncatedText = text.substring(0, maxLength);

    return `<pre class="whitespace-pre-wrap font-mono text-sm">${truncatedText}${
      text.length > maxLength ? '...' : ''
    }</pre>`;
  } catch (error) {
    console.error('Erreur preview PDF:', error);
    return '<p class="text-red-500">Erreur lors de la génération du preview</p>';
  }
}

/**
 * Vérifie si un fichier est un PDF valide
 * @param filePath - Chemin du fichier
 * @returns true si valide
 */
export async function isValidPDF(filePath: string): Promise<boolean> {
  try {
    await parsePDF(filePath);
    return true;
  } catch {
    return false;
  }
}
