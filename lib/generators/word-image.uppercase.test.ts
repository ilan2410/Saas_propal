import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { renderWordWithImages } from './word-image';

// Vérifie de bout en bout l'option `uppercaseVariables` de `renderWordWithImages` :
// seules les variables ({{...}}) sont mises en majuscules, le texte fixe du modèle
// et la structure des boucles restent intacts. Absente, l'option ne change rien.

function makeDocx(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer' });
}

function readText(bytes: Uint8Array): string {
  return new PizZip(Buffer.from(bytes)).file('word/document.xml')!.asText();
}

describe('renderWordWithImages — uppercaseVariables', () => {
  it('rend les variables texte en MAJUSCULES quand l\'option est active', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>{{nom_client}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, { nom_client: 'Ilan Cohen' }, { uppercaseVariables: true });
    expect(readText(out)).toContain('ILAN COHEN');
  });

  it('met aussi en majuscules le texte des boucles, structure préservée', async () => {
    const docx = makeDocx(
      '<w:p><w:r><w:t>{{#lignes}}[{{intitule}}]{{/lignes}}</w:t></w:r></w:p>',
    );
    const out = await renderWordWithImages(
      docx,
      { lignes: [{ intitule: 'ligne a' }, { intitule: 'ligne b' }] },
      { uppercaseVariables: true },
    );
    const xml = readText(out);
    expect(xml).toContain('[LIGNE A]');
    expect(xml).toContain('[LIGNE B]');
  });

  it('ne modifie pas le texte fixe du modèle', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>Devis pour {{nom_client}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, { nom_client: 'sarl test' }, { uppercaseVariables: true });
    const xml = readText(out);
    expect(xml).toContain('Devis pour');
    expect(xml).toContain('SARL TEST');
  });

  it('met en majuscules une variable dynamique résolue via resolveMissingVar', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>{{ville}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, {}, {
      uppercaseVariables: true,
      resolveMissingVar: (tag) => (tag === 'ville' ? 'paris' : undefined),
    });
    expect(readText(out)).toContain('PARIS');
  });

  it('laisse le texte inchangé quand l\'option est absente (défaut)', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>{{nom_client}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, { nom_client: 'Ilan Cohen' });
    expect(readText(out)).toContain('Ilan Cohen');
  });

  it('laisse le texte inchangé quand uppercaseVariables vaut false', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>{{nom_client}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, { nom_client: 'Ilan Cohen' }, { uppercaseVariables: false });
    expect(readText(out)).toContain('Ilan Cohen');
  });
});
