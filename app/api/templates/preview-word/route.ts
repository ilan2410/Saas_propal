import { NextRequest, NextResponse } from 'next/server';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { createClient } from '@/lib/supabase/server';
import { buildSpWordData } from '@/lib/generators/sp-word-data';
import {
  isPlainObject,
  findValueInData,
  formatValueForWord,
  flattenForDocx,
  setNestedValue,
  buildSaWordData,
  type UnknownRecord,
} from '@/lib/generators/word-data-utils';
import type { SuggestionsSpCompletes, WordConfig } from '@/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImageModule = require('docxtemplater-image-module') as new (opts: {
  centered?: boolean;
  fileType?: string;
  getImage: (tagValue: string) => Promise<Buffer> | Buffer;
  getSize: (img: Buffer, tagValue: string) => [number, number];
}) => object;

// 1×1 transparent PNG — placeholder quand aucune URL d'image n'est fournie
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Génère un aperçu du template Word rempli avec les vraies valeurs (SA + SP)
 * de la dernière proposition du template, sans créer de proposition ni
 * stocker de fichier. Le DOCX rempli est renvoyé en binaire.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const templateId = formData.get('templateId');
    const uploadedFile = formData.get('file');

    if (typeof templateId !== 'string' || !templateId) {
      return NextResponse.json({ error: 'templateId manquant' }, { status: 400 });
    }

    // 1. Récupérer le template (config + file_url) en vérifiant l'organisation
    const { data: template, error: templateError } = await supabase
      .from('proposition_templates')
      .select('id, file_url, file_config')
      .eq('id', templateId)
      .eq('organization_id', user.id)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
    }

    // 2. Récupérer le buffer du template (upload en cours, sinon storage)
    let templateBuffer: ArrayBuffer;
    if (uploadedFile && uploadedFile instanceof File) {
      templateBuffer = await uploadedFile.arrayBuffer();
    } else if (template.file_url) {
      const response = await fetch(template.file_url);
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Impossible de charger le document Word du template' },
          { status: 502 }
        );
      }
      templateBuffer = await response.arrayBuffer();
    } else {
      return NextResponse.json({ error: 'Aucun fichier Word disponible' }, { status: 400 });
    }

    // 3. Récupérer la proposition source.
    //    Priorité : la plus récente proposition AYANT des données SP
    //    (suggestions_sp_completes non nul). À défaut, la plus récente tout
    //    court (les variables SA seront remplies, les tableaux SP resteront vides).
    const baseSelect = 'extracted_data, filled_data, suggestions_sp_completes';

    const { data: propWithSp } = await supabase
      .from('propositions')
      .select(baseSelect)
      .eq('organization_id', user.id)
      .eq('template_id', templateId)
      .not('suggestions_sp_completes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let proposition = propWithSp;

    if (!proposition) {
      const { data: latestProp } = await supabase
        .from('propositions')
        .select(baseSelect)
        .eq('organization_id', user.id)
        .eq('template_id', templateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      proposition = latestProp;
    }

    if (!proposition) {
      // Aucune donnée disponible : le client basculera sur l'aperçu brut
      return NextResponse.json({ hasData: false });
    }

    // 4. Préparer les données (réplique de generateWordFile)
    const extracted: UnknownRecord = isPlainObject(proposition.extracted_data)
      ? (proposition.extracted_data as UnknownRecord)
      : {};
    const filled: UnknownRecord = isPlainObject(proposition.filled_data)
      ? (proposition.filled_data as UnknownRecord)
      : {};
    const baseData: UnknownRecord = { ...extracted, ...filled };

    const fileConfig = isPlainObject(template.file_config) ? template.file_config : {};
    const mappedData: UnknownRecord = { ...baseData };

    const rawFieldMappings = fileConfig.fieldMappings;
    const fieldMappings: Record<string, string> = {};
    if (isPlainObject(rawFieldMappings)) {
      for (const [k, v] of Object.entries(rawFieldMappings)) {
        if (typeof v === 'string') fieldMappings[k] = v;
      }
    }

    for (const [templateVar, dataKey] of Object.entries(fieldMappings)) {
      const cleanVar = templateVar.replace(/[{}]/g, '').trim();
      if (!cleanVar) continue;

      const value = findValueInData(baseData, dataKey);
      const formatted = formatValueForWord(value);

      if (cleanVar.includes('.')) {
        setNestedValue(mappedData, cleanVar, formatted);
      } else {
        mappedData[cleanVar] = formatted;
      }
    }

    const flatData: UnknownRecord = {};
    flattenForDocx(baseData, flatData);

    const spCompletes = (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
    const wordCfg = fileConfig as unknown as WordConfig;
    const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);
    // Tableaux SA remontés à plat (ex: {{#lignes}}) — priment sur les clés plates SA.
    const saData = buildSaWordData(baseData);
    const finalData = { ...spData, ...mappedData, ...flatData, ...saData };

    // 5. Rendre le DOCX rempli en mémoire
    let uint8Array: Uint8Array;
    try {
      const zip = new PizZip(Buffer.from(templateBuffer));

      // Module image : résout les variables images ({%var}) en téléchargeant l'URL,
      // sinon insère un placeholder transparent (même logique que fillWordTemplate).
      const imageCache = new Map<string, Buffer>();
      const imageModule = new ImageModule({
        centered: false,
        fileType: 'docx',
        getImage: async (tagValue: string) => {
          if (!tagValue || !/^https?:\/\//.test(tagValue)) return PLACEHOLDER_PNG;
          if (imageCache.has(tagValue)) return imageCache.get(tagValue)!;
          try {
            const imgRes = await fetch(tagValue);
            const buf = Buffer.from(await imgRes.arrayBuffer());
            imageCache.set(tagValue, buf);
            return buf;
          } catch {
            return PLACEHOLDER_PNG;
          }
        },
        getSize: () => [150, 100] as [number, number],
      });

      // Construction : en docxtemplater v3 le parsing du template peut lever ici
      // (tags mal formés, fractionnés par la mise en forme, etc.).
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        modules: [imageModule],
        // Aperçu tolérant : variable absente -> chaîne vide (ne bloque pas le rendu).
        nullGetter: () => '',
      });

      await doc.renderAsync(finalData);

      uint8Array = doc.getZip().generate({
        type: 'uint8array',
        compression: 'DEFLATE',
      });
    } catch (error) {
      const e = error as { message?: string; properties?: { errors?: Array<{ properties?: { explanation?: string } }> } };
      const details =
        e?.properties?.errors?.map((er) => er?.properties?.explanation).filter(Boolean).join('\n') ||
        e?.message ||
        'Erreur inconnue';
      return NextResponse.json(
        { error: `Erreur lors du remplissage du document : ${details}` },
        { status: 422 }
      );
    }

    return new NextResponse(Buffer.from(uint8Array), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-Has-Data': '1',
      },
    });
  } catch (error) {
    console.error('Erreur preview-word:', error);
    return NextResponse.json(
      {
        error: 'Échec de la génération de l\'aperçu',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
