// Parser Word (.docx)
import mammoth from 'mammoth';
import fs from 'fs';

/**
 * Parse un fichier Word et extrait le contenu HTML
 * @param filePath - Chemin du fichier Word
 * @returns HTML et texte brut
 */
export async function parseWord(filePath: string): Promise<{
  html: string;
  text: string;
  messages: string[];
}> {
  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.convertToHtml({ buffer });

    // Extraire aussi le texte brut
    const textResult = await mammoth.extractRawText({ buffer });

    return {
      html: result.value,
      text: textResult.value,
      messages: result.messages.map((m) => m.message),
    };
  } catch (error) {
    console.error('Erreur parsing Word:', error);
    throw new Error(
      `Échec du parsing Word: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Détecte les variables dans un document Word (format {{variable}})
 * @param filePath - Chemin du fichier Word
 * @returns Liste des variables détectées
 */
export async function detectWordVariables(
  filePath: string
): Promise<string[]> {
  try {
    const { text } = await parseWord(filePath);

    // Détecter les variables (format {{variable}})
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      variables.push(match[1].trim());
    }

    // Dédupliquer
    return [...new Set(variables)];
  } catch (error) {
    console.error('Erreur détection variables Word:', error);
    return [];
  }
}

/**
 * Parse un Word et retourne un preview HTML
 * @param filePath - Chemin du fichier Word
 * @param maxLength - Longueur maximale du HTML (caractères)
 * @returns HTML preview
 */
export async function getWordPreview(
  filePath: string,
  maxLength: number = 5000
): Promise<string> {
  try {
    const { html } = await parseWord(filePath);
    const truncatedHtml = html.substring(0, maxLength);

    return `<div class="prose max-w-none">${truncatedHtml}${
      html.length > maxLength ? '...' : ''
    }</div>`;
  } catch (error) {
    console.error('Erreur preview Word:', error);
    return '<p class="text-red-500">Erreur lors de la génération du preview</p>';
  }
}

/**
 * Vérifie si un fichier est un Word valide
 * @param filePath - Chemin du fichier
 * @returns true si valide
 */
export async function isValidWord(filePath: string): Promise<boolean> {
  try {
    await parseWord(filePath);
    return true;
  } catch {
    return false;
  }
}
