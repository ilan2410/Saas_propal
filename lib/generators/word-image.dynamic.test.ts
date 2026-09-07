import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { renderWordWithImages } from './word-image';
import { resolveDynamicWordVar } from './dynamic-vars';

// Vérifie de bout en bout que docxtemplater transmet bien une balise contenant un
// tiret + chiffres (`sp_date_limite_souscription-15`) au `nullGetter` sans la
// mutiler ni l'interpréter comme une soustraction, et que `resolveMissingVar` la
// résout au rendu.

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

const resolveMissingVar = (tag: string) =>
  resolveDynamicWordVar(tag, { createdAt: '2026-09-07T00:00:00.000Z' });

describe('renderWordWithImages — variable dynamique sp_date_limite_souscription', () => {
  it('résout la balise avec paramètre (création + 15 jours)', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>Valable jusqu\'au {{sp_date_limite_souscription-15}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, {}, { resolveMissingVar });
    expect(readText(out)).toContain('22/09/2026');
  });

  it('résout la balise sans paramètre (date de création)', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>{{sp_date_limite_souscription}}</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, {}, { resolveMissingVar });
    expect(readText(out)).toContain('07/09/2026');
  });

  it('laisse vide une autre variable manquante', async () => {
    const docx = makeDocx('<w:p><w:r><w:t>[{{sp_variable_inexistante}}]</w:t></w:r></w:p>');
    const out = await renderWordWithImages(docx, {}, { resolveMissingVar });
    expect(readText(out)).toContain('[]');
  });
});
