// Générateur Word - Modification directe du template
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { createClient } from '@/lib/supabase/server';
import { WordConfig } from '@/types';

/**
 * Remplit un template Word en le dupliquant et en le modifiant
 * @param templateUrl - URL du template master
 * @param data - Données à injecter
 * @param fileConfig - Configuration du mapping
 * @param organizationId - ID de l'organisation
 * @returns URL du fichier généré
 */
export async function fillWordTemplate(
  templateUrl: string,
  data: Record<string, any>,
  fileConfig: WordConfig,
  organizationId: string
): Promise<string> {
  try {
    const supabase = await createClient();

    // 1. Télécharger le template master
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error('Échec du téléchargement du template');
    }
    const templateBuffer = await response.arrayBuffer();

    // 2. Charger le template avec PizZip
    const zip = new PizZip(Buffer.from(templateBuffer));

    // 3. Initialiser Docxtemplater
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}',
      },
    });

    // 4. Préparer les données selon le mapping
    const mappedData: Record<string, any> = {};

    for (const [templateVar, dataKey] of Object.entries(
      fileConfig.fieldMappings
    )) {
      // Nettoyer le nom de variable (enlever {{ }})
      const cleanVar = templateVar.replace(/[{}]/g, '');
      mappedData[cleanVar] = data[dataKey] || '';
    }

    // 5. Remplir le template (MODIFICATION DIRECTE)
    doc.render(mappedData);

    // 6. Générer le buffer du fichier modifié
    const filledBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    // 7. Upload du fichier dupliqué et modifié vers Supabase Storage
    const fileName = `proposition-${Date.now()}.docx`;
    const { error } = await supabase.storage
      .from('propositions')
      .upload(fileName, filledBuffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (error) throw error;

    // 8. Obtenir l'URL publique
    const {
      data: { publicUrl },
    } = supabase.storage.from('propositions').getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Erreur génération Word:', error);
    throw new Error(
      `Échec de la génération Word: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Génère un preview du template Word rempli (sans sauvegarder)
 * @param templateUrl - URL du template
 * @param data - Données de test
 * @param fileConfig - Configuration
 * @returns HTML preview
 */
export async function generateWordPreview(
  templateUrl: string,
  data: Record<string, any>,
  fileConfig: WordConfig
): Promise<string> {
  try {
    // Pour un vrai preview, il faudrait convertir le Word en HTML
    // Pour l'instant, on retourne un message
    return `<div class="p-4 border rounded bg-gray-50">
      <p class="font-semibold mb-2">Preview Word</p>
      <p class="text-sm text-gray-600">Le fichier Word sera généré avec les données suivantes :</p>
      <pre class="mt-2 text-xs">${JSON.stringify(data, null, 2)}</pre>
    </div>`;
  } catch (error) {
    console.error('Erreur preview Word:', error);
    return '<p class="text-red-500">Erreur lors de la génération du preview</p>';
  }
}
