import PizZip from 'pizzip';

// Placement de la signature DocuSeal dans le DOCX généré.
//
// docxtemplater utilise déjà la syntaxe {{ }} : une balise DocuSeal écrite telle
// quelle dans un modèle serait consommée au rendu. Le modèle utilise donc la
// variable {{signature_client}}, qui reçoit en mode signature un marqueur neutre
// (lettres majuscules uniquement, inchangé par l'option « variables en
// majuscules »), remplacé ici par la vraie balise DocuSeal. Sans marqueur dans le
// document, un bloc « Bon pour accord » est ajouté en fin de document.

export const SIGNATURE_CLIENT_VARIABLE = 'signature_client';
export const SIGNATURE_PLACEHOLDER = 'XDOCUSEALSIGNATURECLIENTX';
/** {{paraphe_client}} : à placer dans le pied de page pour un paraphe sur chaque page. */
export const PARAPHE_CLIENT_VARIABLE = 'paraphe_client';
export const PARAPHE_PLACEHOLDER = 'XDOCUSEALPARAPHECLIENTX';

/** Nom du champ texte « Nom » du bloc automatique (pré-rempli avec le nom du signataire). */
export const AUTO_BLOCK_NAME_FIELD = 'Nom';

const ROLE = 'Client';
export const SIGNATURE_TAG = `{{Signature;role=${ROLE};type=signature;width=200;height=70}}`;
export const NAME_TAG = `{{${AUTO_BLOCK_NAME_FIELD};role=${ROLE};type=text}}`;
export const DATE_TAG = `{{Date;role=${ROLE};type=datenow;format=DD/MM/YYYY}}`;
export const PARAPHE_TAG = `{{Paraphe;role=${ROLE};type=initials;width=60;height=30}}`;

export type SignaturePlacement = 'placeholder' | 'auto_block';

const PART_PATTERN = /^word\/(document|header\d*|footer\d*)\.xml$/;

function paragraph(text: string, { bold = false, spacingBefore = 0, keepNext = true } = {}): string {
  const pPr = [
    keepNext ? '<w:keepNext/><w:keepLines/>' : '',
    spacingBefore ? `<w:spacing w:before="${spacingBefore}"/>` : '',
  ].join('');
  const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function autoBlockXml(): string {
  return [
    paragraph('Bon pour accord', { bold: true, spacingBefore: 480 }),
    paragraph(`Nom : ${NAME_TAG}`),
    paragraph(`Date : ${DATE_TAG}`),
    paragraph('Signature :'),
    paragraph(SIGNATURE_TAG, { keepNext: false }),
  ].join('');
}

/** Insère le bloc avant le dernier <w:sectPr> du corps (propriétés de section finales). */
function insertAutoBlock(documentXml: string): string {
  const bodyEnd = documentXml.lastIndexOf('</w:body>');
  if (bodyEnd === -1) throw new Error('Document Word invalide : corps introuvable.');
  const lastSectPr = documentXml.lastIndexOf('<w:sectPr', bodyEnd);
  // Un <w:sectPr> dans un <w:pPr> appartient à un paragraphe : seul celui qui est
  // enfant direct de <w:body> (après le dernier </w:p> ou </w:tbl>) compte.
  const lastBlockEnd = Math.max(documentXml.lastIndexOf('</w:p>', bodyEnd), documentXml.lastIndexOf('</w:tbl>', bodyEnd));
  const insertAt = lastSectPr !== -1 && lastSectPr > lastBlockEnd ? lastSectPr : bodyEnd;
  return documentXml.slice(0, insertAt) + autoBlockXml() + documentXml.slice(insertAt);
}

/**
 * Remplace les marqueurs {{signature_client}} / {{paraphe_client}} par les balises
 * DocuSeal. Sans {{signature_client}}, ajoute le bloc de signature automatique
 * (sauf `autoBlock: false`, utilisé pour les annexes).
 */
export function applySignatureTags(docx: Uint8Array, { autoBlock = true } = {}): { buffer: Uint8Array; placement: SignaturePlacement | null; paraphes: boolean } {
  const zip = new PizZip(docx);
  let found = false;
  let paraphes = false;

  for (const name of Object.keys(zip.files)) {
    if (!PART_PATTERN.test(name)) continue;
    let xml = zip.file(name)?.asText();
    if (!xml) continue;
    const hasSignature = xml.includes(SIGNATURE_PLACEHOLDER);
    const hasParaphe = xml.includes(PARAPHE_PLACEHOLDER);
    if (!hasSignature && !hasParaphe) continue;
    if (hasSignature) {
      found = true;
      xml = xml.split(SIGNATURE_PLACEHOLDER).join(SIGNATURE_TAG);
    }
    if (hasParaphe) {
      paraphes = true;
      xml = xml.split(PARAPHE_PLACEHOLDER).join(PARAPHE_TAG);
    }
    zip.file(name, xml);
  }

  if (!found && !autoBlock) {
    return { buffer: zip.generate({ type: 'uint8array', compression: 'DEFLATE' }), placement: null, paraphes };
  }

  if (!found) {
    const documentXml = zip.file('word/document.xml')?.asText();
    if (!documentXml) throw new Error('Document Word invalide : word/document.xml introuvable.');
    zip.file('word/document.xml', insertAutoBlock(documentXml));
  }

  return {
    buffer: zip.generate({ type: 'uint8array', compression: 'DEFLATE' }),
    placement: found ? 'placeholder' : 'auto_block',
    paraphes,
  };
}

/** Libellés visibles dans l'aperçu à la place des balises DocuSeal (même emplacement). */
const PREVIEW_LABELS: Array<[string, string]> = [
  [SIGNATURE_TAG, '[ Signature du client ]'],
  [NAME_TAG, '[ Nom du signataire ]'],
  [DATE_TAG, '[ Date de signature ]'],
  [PARAPHE_TAG, '[ Paraphe ]'],
];

/**
 * Aperçu avant envoi : remplace les balises DocuSeal par des libellés lisibles,
 * pour vérifier l'emplacement de la zone de signature.
 */
export function previewSignatureLabels(docx: Uint8Array): Uint8Array {
  const zip = new PizZip(docx);
  for (const name of Object.keys(zip.files)) {
    if (!PART_PATTERN.test(name)) continue;
    let xml = zip.file(name)?.asText();
    if (!xml) continue;
    let changed = false;
    for (const [tag, label] of PREVIEW_LABELS) {
      if (xml.includes(tag)) {
        xml = xml.split(tag).join(label);
        changed = true;
      }
    }
    if (changed) zip.file(name, xml);
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
