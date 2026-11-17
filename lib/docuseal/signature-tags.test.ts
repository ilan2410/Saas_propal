import { afterEach, describe, expect, it, vi } from 'vitest';
import PizZip from 'pizzip';
import { applySignatureTags, PARAPHE_PLACEHOLDER, PARAPHE_TAG, previewSignatureLabels, SIGNATURE_PLACEHOLDER, SIGNATURE_TAG } from './signature-tags';
import { renderWordPropositionFromTemplate } from '@/lib/generators/word-proposition';

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ storage: { from: () => ({}) } }),
}));
vi.mock('@/lib/security/storage-access', () => ({
  signedOrganizationStorageUrl: async (_s: unknown, url: string) => url,
}));

function makeDocx(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

function documentXml(bytes: Uint8Array): string {
  return new PizZip(Buffer.from(bytes)).file('word/document.xml')!.asText();
}

const SECT_PR = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('applySignatureTags', () => {
  it('remplace le marqueur {{signature_client}} par la balise DocuSeal', () => {
    const docx = makeDocx(`<w:p><w:r><w:t>Signature : ${SIGNATURE_PLACEHOLDER}</w:t></w:r></w:p>${SECT_PR}`);
    const { buffer, placement } = applySignatureTags(docx);
    const xml = documentXml(buffer);
    expect(placement).toBe('placeholder');
    expect(xml).toContain(`Signature : ${SIGNATURE_TAG}`);
    expect(xml).not.toContain(SIGNATURE_PLACEHOLDER);
    expect(xml).not.toContain('Bon pour accord');
  });

  it('ajoute un bloc « Bon pour accord » avant les propriétés de section finales', () => {
    const docx = makeDocx(`<w:p><w:r><w:t>Corps</w:t></w:r></w:p>${SECT_PR}`);
    const { buffer, placement } = applySignatureTags(docx);
    const xml = documentXml(buffer);
    expect(placement).toBe('auto_block');
    expect(xml).toContain('Bon pour accord');
    expect(xml).toContain(SIGNATURE_TAG);
    expect(xml).toContain('{{Nom;role=Client;type=text}}');
    expect(xml.indexOf(SIGNATURE_TAG)).toBeLessThan(xml.lastIndexOf('<w:sectPr'));
    expect(xml.indexOf('Corps')).toBeLessThan(xml.indexOf('Bon pour accord'));
  });

  it('ajoute le bloc en fin de corps quand le document n’a pas de sectPr', () => {
    const { buffer } = applySignatureTags(makeDocx('<w:p><w:r><w:t>Corps</w:t></w:r></w:p>'));
    const xml = documentXml(buffer);
    expect(xml.indexOf(SIGNATURE_TAG)).toBeLessThan(xml.indexOf('</w:body>'));
  });
});

describe('rendu Word en mode signature', () => {
  const baseOptions = {
    template: { id: 't', file_type: 'word' as const, file_url: 'https://storage.example.test/t.docx', file_config: { forcerMajusculesVariables: true }, champs_actifs: [] },
    donnees: { nom_client: 'acme' },
    organization_id: 'org',
    proposition_id: 'prop',
  };

  function stubTemplate(text: string) {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    const docx = makeDocx(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Uint8Array.from(docx).buffer }));
  }

  it('laisse {{signature_client}} vide dans le document téléchargé', async () => {
    stubTemplate('[{{signature_client}}]');
    const xml = documentXml(await renderWordPropositionFromTemplate(baseOptions));
    expect(xml).toContain('[]');
  });

  it('produit une balise DocuSeal intacte même avec les variables en majuscules', async () => {
    stubTemplate('[{{signature_client}}]');
    const rendered = await renderWordPropositionFromTemplate({ ...baseOptions, signatureMode: true });
    const { buffer, placement } = applySignatureTags(rendered);
    expect(placement).toBe('placeholder');
    expect(documentXml(buffer)).toContain(`[${SIGNATURE_TAG}]`);
  });
});

describe('previewSignatureLabels', () => {
  it('remplace les balises DocuSeal par des libellés lisibles au même endroit', () => {
    const { buffer } = applySignatureTags(makeDocx(`<w:p><w:r><w:t>Corps</w:t></w:r></w:p>${SECT_PR}`));
    const xml = documentXml(previewSignatureLabels(buffer));
    expect(xml).toContain('[ Signature du client ]');
    expect(xml).toContain('[ Nom du signataire ]');
    expect(xml).toContain('[ Date de signature ]');
    expect(xml).not.toContain('{{');
  });
});

describe('paraphes', () => {
  function withFooter(body: string, footer: string): Buffer {
    const zip = new PizZip(makeDocx(body));
    zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${footer}</w:t></w:r></w:p></w:ftr>`);
    return zip.generate({ type: 'nodebuffer' });
  }

  it('remplace {{paraphe_client}} du pied de page par un champ paraphe DocuSeal', () => {
    const docx = withFooter(`<w:p><w:r><w:t>${SIGNATURE_PLACEHOLDER}</w:t></w:r></w:p>`, `Paraphe : ${PARAPHE_PLACEHOLDER}`);
    const { buffer, paraphes, placement } = applySignatureTags(docx);
    const footer = new PizZip(Buffer.from(buffer)).file('word/footer1.xml')!.asText();
    expect(paraphes).toBe(true);
    expect(placement).toBe('placeholder');
    expect(footer).toContain(`Paraphe : ${PARAPHE_TAG}`);
    expect(PARAPHE_TAG).toContain('type=initials');
  });

  it('annexe : pas de bloc automatique, mais les paraphes sont posés', () => {
    const docx = withFooter('<w:p><w:r><w:t>Annexe</w:t></w:r></w:p>', PARAPHE_PLACEHOLDER);
    const { buffer, placement, paraphes } = applySignatureTags(docx, { autoBlock: false });
    expect(placement).toBeNull();
    expect(paraphes).toBe(true);
    expect(documentXml(buffer)).not.toContain('Bon pour accord');
  });

  it('libellé lisible dans l’aperçu', () => {
    const { buffer } = applySignatureTags(withFooter(`<w:p><w:r><w:t>${SIGNATURE_PLACEHOLDER}</w:t></w:r></w:p>`, PARAPHE_PLACEHOLDER));
    const footer = new PizZip(Buffer.from(previewSignatureLabels(buffer))).file('word/footer1.xml')!.asText();
    expect(footer).toContain('[ Paraphe ]');
  });
});
