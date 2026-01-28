// Générateur PDF - Modification directe du template
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { PDFConfig } from '@/types';

/**
 * Remplit un template PDF en le dupliquant et en le modifiant
 * @param templateUrl - URL du template master
 * @param data - Données à injecter
 * @param fileConfig - Configuration du mapping
 * @param organizationId - ID de l'organisation
 * @returns URL du fichier généré
 */
export async function fillPDFTemplate(
  templateUrl: string,
  data: Record<string, unknown>,
  fileConfig: PDFConfig,
  _organizationId: string
): Promise<string> {
  try {
    void _organizationId;
    const supabase = await createClient();

    // 1. Télécharger le template master
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error('Échec du téléchargement du template');
    }
    const templateBuffer = await response.arrayBuffer();

    // 2. Charger le PDF
    const pdfDoc = await PDFDocument.load(templateBuffer);

    // 3. Remplir les champs de formulaire PDF (MODIFICATION DIRECTE)
    const form = pdfDoc.getForm();

    for (const [pdfFieldName, dataKey] of Object.entries(
      fileConfig.champsFormulaire
    )) {
      try {
        const field = form.getTextField(pdfFieldName);
        const value = data[dataKey];
        field.setText(value === undefined || value === null ? '' : String(value));
      } catch (error) {
        console.warn(
          `Champ PDF "${pdfFieldName}" introuvable ou non modifiable`,
          error
        );
      }
    }

    // Optionnel : Aplatir le formulaire (rendre non-éditable)
    // form.flatten();

    // 4. Sauvegarder le PDF modifié
    const filledBuffer = await pdfDoc.save();

    // 5. Upload vers Supabase Storage
    const fileName = `proposition-${Date.now()}.pdf`;
    const { error } = await supabase.storage
      .from('propositions')
      .upload(fileName, filledBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (error) throw error;

    // 6. Obtenir l'URL publique
    const {
      data: { publicUrl },
    } = supabase.storage.from('propositions').getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    throw new Error(
      `Échec de la génération PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}

/**
 * Liste les champs de formulaire d'un PDF
 * @param templateUrl - URL du template
 * @returns Liste des noms de champs
 */
export async function listPDFFormFields(
  templateUrl: string
): Promise<string[]> {
  try {
    const response = await fetch(templateUrl);
    const templateBuffer = await response.arrayBuffer();

    const pdfDoc = await PDFDocument.load(templateBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    return fields.map((field) => field.getName());
  } catch (error) {
    console.error('Erreur listage champs PDF:', error);
    return [];
  }
}

/**
 * Génère un preview du PDF (première page)
 * @param templateUrl - URL du template
 * @returns HTML preview
 */
export async function generatePDFPreview(
  templateUrl: string
): Promise<string> {
  try {
    void templateUrl;
    return `<div class="p-4 border rounded bg-gray-50">
      <p class="font-semibold mb-2">Preview PDF</p>
      <p class="text-sm text-gray-600">Le PDF sera rempli avec les données extraites.</p>
      <p class="text-sm text-gray-600 mt-2">Note : Seuls les formulaires PDF remplissables sont supportés.</p>
    </div>`;
  } catch (error) {
    console.error('Erreur preview PDF:', error);
    return '<p class="text-red-500">Erreur lors de la génération du preview</p>';
  }
}
