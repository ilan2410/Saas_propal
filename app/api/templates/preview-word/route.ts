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
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { calculateCartSummary, type CartLine } from '@/lib/sp/calculateCart';
import type { SuggestionsSpCompletes, WordConfig, SpQuestion, SpQuestionReponse, CatalogueProduit, SpLigneMobile, SpLigneFixe, SpInternet, SpSituationProposeeLigne } from '@/types';
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

type MaterialImageTemplateInspection = {
  hasUnsupportedImageLoop: boolean;
  xmlSummary: Array<{
    name: string;
    rawHasLoopStart: boolean;
    rawHasImageTag: boolean;
    rawHasLoopEnd: boolean;
    plainHasLoopStart: boolean;
    plainHasImageTag: boolean;
    plainHasLoopEnd: boolean;
    startImageCellIndex: number;
    endCellIndex: number;
    rowWithStartImageEndPlain: boolean;
    fragmentedImageTag: boolean;
    fragmentedLoopEnd: boolean;
    unsupportedLoopAcrossCells: boolean;
    startContext?: string;
    imageContext?: string;
    endContext?: string;
  }>;
};

function inspectMaterialImageTemplate(zip: PizZip): MaterialImageTemplateInspection {
  const loopStart = '{{#sp_materiel_detail}}';
  const imageTag = '{{%sp_matd_image_url}}';
  const loopEnd = '{{/sp_materiel_detail}}';
  const toPlainText = (xml: string) => xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const xmlFiles = Object.keys((zip as unknown as { files?: Record<string, unknown> }).files ?? {})
    .filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));

  const xmlSummary = xmlFiles.map((name) => {
    const xml = zip.file(name)?.asText?.() ?? '';
    const plain = toPlainText(xml);
    const cells = xml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
    const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
    const cellTexts = cells.map(toPlainText);
    const rowTexts = rows.map(toPlainText);
    const startImageCellIndex = cellTexts.findIndex((text) => text.includes(loopStart) && text.includes(imageTag));
    const endCellIndex = cellTexts.findIndex((text) => text.includes(loopEnd));
    const rowWithStartImageEndPlain = rowTexts.some(
      (text) => text.includes(loopStart) && text.includes(imageTag) && text.includes(loopEnd),
    );
    const around = (tag: string) => {
      const idx = plain.indexOf(tag);
      return idx >= 0 ? plain.slice(Math.max(0, idx - 160), Math.min(plain.length, idx + tag.length + 160)) : undefined;
    };

    const summary = {
      name,
      rawHasLoopStart: xml.includes(loopStart),
      rawHasImageTag: xml.includes(imageTag),
      rawHasLoopEnd: xml.includes(loopEnd),
      plainHasLoopStart: plain.includes(loopStart),
      plainHasImageTag: plain.includes(imageTag),
      plainHasLoopEnd: plain.includes(loopEnd),
      startImageCellIndex,
      endCellIndex,
      rowWithStartImageEndPlain,
      fragmentedImageTag: plain.includes(imageTag) && !xml.includes(imageTag),
      fragmentedLoopEnd: plain.includes(loopEnd) && !xml.includes(loopEnd),
      unsupportedLoopAcrossCells:
        rowWithStartImageEndPlain &&
        startImageCellIndex >= 0 &&
        endCellIndex >= 0 &&
        startImageCellIndex !== endCellIndex,
      startContext: around(loopStart),
      imageContext: around(imageTag),
      endContext: around(loopEnd),
    };

    return summary;
  });

  return {
    hasUnsupportedImageLoop: xmlSummary.some(
      (summary) => summary.unsupportedLoopAcrossCells || summary.fragmentedImageTag || summary.fragmentedLoopEnd,
    ),
    xmlSummary,
  };
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function parsePositiveQuantity(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function findCatalogueMensuelProduit(
  catalogueMap: Map<string, CatalogueProduit>,
  produitId?: string,
  produitNom?: string,
): CatalogueProduit | undefined {
  if (produitId && catalogueMap.has(produitId)) return catalogueMap.get(produitId);
  if (produitNom) {
    for (const item of catalogueMap.values()) {
      if (item.nom === produitNom) return item;
    }
  }
  return undefined;
}

function buildForfaitsSansRemiseTable(
  lignes: Array<SpLigneMobile | SpLigneFixe | SpInternet>,
  catalogueMap: Map<string, CatalogueProduit>,
): SpSituationProposeeLigne[] {
  const rows: SpSituationProposeeLigne[] = [];
  let remiseTotale = 0;

  for (const ligne of lignes) {
    const quantite = parsePositiveQuantity(ligne.sp_quantite);
    const catalogueItem = findCatalogueMensuelProduit(catalogueMap, ligne.sp_produit_id, ligne.sp_produit);
    const originalUnitPrice = catalogueItem?.prix_mensuel ?? (ligne._prix_propose_raw / quantite);
    const originalTotal = originalUnitPrice * quantite;
    const remiseLigne = originalTotal - ligne._prix_propose_raw;

    rows.push({
      sp_sp_type: ligne.sp_type_ligne,
      sp_sp_nom: ligne.sp_nom_ligne,
      sp_sp_numero: ligne.sp_numero,
      sp_sp_quantite: ligne.sp_quantite,
      sp_sp_produit: ligne.sp_produit,
      sp_sp_fournisseur: ligne.sp_produit_fournisseur,
      sp_sp_prix_actuel: ligne.sp_prix_actuel,
      sp_sp_prix_propose: formatEuro(originalTotal),
      sp_sp_economie: ligne.sp_economie,
      sp_sp_analyse: ligne.sp_analyse,
      _prix_raw: originalTotal,
    });

    if (remiseLigne > 0.005) remiseTotale += remiseLigne;
  }

  if (remiseTotale > 0.005) {
    rows.push({
      sp_sp_type: '',
      sp_sp_nom: 'Remise',
      sp_sp_numero: '',
      sp_sp_quantite: '',
      sp_sp_produit: 'Remise',
      sp_sp_fournisseur: '',
      sp_sp_prix_actuel: undefined,
      sp_sp_prix_propose: formatEuro(-remiseTotale),
      sp_sp_economie: undefined,
      sp_sp_analyse: '',
      _prix_raw: -remiseTotale,
    });
  }

  return rows;
}

function rebuildTelecomLinesFromQuestionnaire<T extends SpLigneMobile | SpLigneFixe | SpInternet>(
  existingLines: T[],
  cartLines: CartLine[],
  lineType: T['sp_type_ligne'],
  catalogueMap: Map<string, CatalogueProduit>,
): T[] {
  if (cartLines.length === 0) return existingLines;

  return cartLines.map((cartLine, index) => {
    const existing = existingLines[index];
    const catalogueItem = cartLine.produitId ? catalogueMap.get(cartLine.produitId) : undefined;
    const prixActuel = existing?._prix_actuel_raw ?? 0;
    const prixPropose = cartLine.prixTotal;
    const economie = prixActuel - prixPropose;

    return {
      sp_nom_ligne: existing?.sp_nom_ligne ?? cartLine.produitNom,
      sp_numero: existing?.sp_numero,
      sp_quantite: String(cartLine.quantite),
      sp_produit: cartLine.produitNom,
      sp_produit_id: cartLine.produitId ?? existing?.sp_produit_id,
      sp_produit_fournisseur: catalogueItem?.fournisseur ?? existing?.sp_produit_fournisseur,
      sp_prix_actuel: formatEuro(prixActuel),
      sp_prix_propose: formatEuro(prixPropose),
      sp_economie: formatEuro(economie),
      sp_analyse: existing?.sp_analyse ?? '',
      sp_justification: existing?.sp_justification ?? '',
      sp_type_ligne: lineType,
      _prix_actuel_raw: prixActuel,
      _prix_propose_raw: prixPropose,
      _economie_raw: economie,
    } as T;
  });
}

function repairSpCompletesFromQuestionnaire(
  sp: SuggestionsSpCompletes | null,
  reponses: SpQuestionReponse[],
  questions: SpQuestion[],
  catalogue: CatalogueProduit[],
  donneesExtraites: UnknownRecord,
): SuggestionsSpCompletes | null {
  if (!sp || reponses.length === 0 || questions.length === 0 || catalogue.length === 0) return sp;

  const cart = calculateCartSummary(reponses, questions, catalogue, donneesExtraites);
  const catalogueMap = new Map<string, CatalogueProduit>();
  for (const item of catalogue) catalogueMap.set(item.id, item);
  const mobileCartLines = cart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'mobile');
  const fixeCartLines = cart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'fixe');
  const internetCartLines = cart.lines.filter((line) => line.type_frequence === 'mensuel' && line.categorie === 'internet');
  const hasTelecomSelections = mobileCartLines.length > 0 || fixeCartLines.length > 0 || internetCartLines.length > 0;

  const mobiles = hasTelecomSelections
    ? (mobileCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp.sp_lignes_mobiles ?? [], mobileCartLines, 'Mobile', catalogueMap) : [])
    : (sp.sp_lignes_mobiles ?? []);
  const fixes = hasTelecomSelections
    ? (fixeCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp.sp_lignes_fixes ?? [], fixeCartLines, 'Fixe', catalogueMap) : [])
    : (sp.sp_lignes_fixes ?? []);
  const internet = hasTelecomSelections
    ? (internetCartLines.length > 0 ? rebuildTelecomLinesFromQuestionnaire(sp.sp_internet ?? [], internetCartLines, 'Internet', catalogueMap) : [])
    : (sp.sp_internet ?? []);
  const toutes = [...fixes, ...mobiles, ...internet];

  const toSituationLigne = (line: SpLigneMobile | SpLigneFixe | SpInternet): SpSituationProposeeLigne => ({
    sp_sp_type: line.sp_type_ligne,
    sp_sp_nom: line.sp_nom_ligne,
    sp_sp_numero: line.sp_numero,
    sp_sp_quantite: line.sp_quantite,
    sp_sp_produit: line.sp_produit,
    sp_sp_fournisseur: line.sp_produit_fournisseur,
    sp_sp_prix_actuel: line.sp_prix_actuel,
    sp_sp_prix_propose: line.sp_prix_propose,
    sp_sp_economie: line.sp_economie,
    sp_sp_analyse: line.sp_analyse,
    _prix_raw: line._prix_propose_raw,
  });

  const repaired = {
    ...sp,
    sp_lignes_mobiles: mobiles,
    sp_lignes_fixes: fixes,
    sp_internet: internet,
    sp_fixes_mobiles: [...fixes, ...mobiles],
    sp_fixes_mobiles_internet: toutes,
    sp_toutes_lignes: toutes,
    sp_situation_proposee_forfaits: toutes.map(toSituationLigne),
    sp_situation_proposee_forfaits_sans_remise: buildForfaitsSansRemiseTable(toutes, catalogueMap),
    sp_situation_proposee_complet: [
      ...toutes.map(toSituationLigne),
      ...(sp.sp_materiel ?? []).map((m) => ({
        sp_sp_type: 'Materiel',
        sp_sp_nom: m.sp_materiel_nom,
        sp_sp_produit: m.sp_materiel_nom,
        sp_sp_fournisseur: m.sp_materiel_fournisseur,
        sp_sp_prix_actuel: undefined,
        sp_sp_prix_propose: m.sp_materiel_prix_mensuel,
        sp_sp_economie: undefined,
        sp_sp_analyse: m.sp_materiel_commentaire,
        _prix_raw: m._prix_mensuel_raw,
      })),
    ],
    sp_total_forfaits_mensuel_ht: formatEuro(toutes.reduce((sum, line) => sum + line._prix_propose_raw, 0)),
  };

  return repaired;
}

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
    const baseSelect = 'template_id, extracted_data, filled_data, suggestions_sp_completes, sp_reponses, organizations(sp_questions)';

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
    let propositionSource = 'latest_with_sp';

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
      propositionSource = 'latest_any';
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
    if (isPlainObject(baseData.situation_actuelle)) {
      const situationActuelle = { ...baseData.situation_actuelle };
      const saCart = calculateSaCartSummary({ situation_actuelle: situationActuelle });
      situationActuelle.total_abonnements = Math.round((saCart.lignesFixes + saCart.lignesMobiles + saCart.lignesInternet + saCart.abonnements) * 100) / 100;
      situationActuelle.total_loyer_mensuel = saCart.totalMensuel;
      situationActuelle.total_materiel = saCart.locations;
      baseData.situation_actuelle = situationActuelle;
    }

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

    const orgRaw = (proposition as Record<string, unknown>).organizations;
    const org = isPlainObject(orgRaw)
      ? orgRaw as UnknownRecord
      : Array.isArray(orgRaw) && orgRaw.length > 0 && isPlainObject(orgRaw[0])
        ? orgRaw[0] as UnknownRecord
        : {};
    const allQuestions = Array.isArray(org.sp_questions) ? org.sp_questions as SpQuestion[] : [];
    const propositionTemplateId = typeof (proposition as Record<string, unknown>).template_id === 'string'
      ? (proposition as Record<string, unknown>).template_id as string
      : template.id;
    const templateQuestions = allQuestions.filter((question) => question.template_id === propositionTemplateId);
    const spReponses = Array.isArray((proposition as Record<string, unknown>).sp_reponses)
      ? (proposition as Record<string, unknown>).sp_reponses as SpQuestionReponse[]
      : [];
    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .or(`organization_id.eq.${user.id},organization_id.is.null`);
    const catalogue = Array.isArray(catalogueRows) ? catalogueRows as CatalogueProduit[] : [];

    const storedSpCompletes = (proposition.suggestions_sp_completes ?? null) as SuggestionsSpCompletes | null;
    const spCompletes = repairSpCompletesFromQuestionnaire(storedSpCompletes, spReponses, templateQuestions, catalogue, baseData);
    const wordCfg = fileConfig as unknown as WordConfig;
    const spData = buildSpWordData(spCompletes, wordCfg.spTableauxFusionnes);
    // Tableaux SA remontés à plat (ex: {{#lignes}}) — priment sur les clés plates SA.
    const saData = buildSaWordData(baseData);
    const finalData = { ...spData, ...mappedData, ...flatData, ...saData };

    // 5. Rendre le DOCX rempli en mémoire
    let uint8Array: Uint8Array;
    try {
      const zip = new PizZip(Buffer.from(templateBuffer));
      const materialImageInspection = inspectMaterialImageTemplate(zip);
      // #region debug-point A:template-xml-structure
      await (async()=>{const fs=require('node:fs'),p='.dbg/word-image-table-loop.env';let u='http://127.0.0.1:7777/event',s='word-image-table-loop';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'A',location:'preview-word/route.ts:zip-scan',msg:'[DEBUG] scanned word xml for material image loop structure',data:{hasUnsupportedImageLoop:materialImageInspection.hasUnsupportedImageLoop,xmlSummary:materialImageInspection.xmlSummary},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      if (materialImageInspection.hasUnsupportedImageLoop) {
        return NextResponse.json(
          {
            error: 'Erreur lors du remplissage du document',
            details: "Structure Word non supportee pour l'image materiel : ne placez pas {{#sp_materiel_detail}} dans la cellule de l'image et ne fermez pas la boucle {{/sp_materiel_detail}} dans une autre cellule de la meme ligne. Laissez {{%sp_matd_image_url}} seule dans sa cellule et placez la boucle dans un bloc ou une structure de tableau compatible.",
          },
          { status: 400 },
        );
      }

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

      // #region debug-point D:before-render-material-data
      await (async()=>{const fs=require('node:fs'),p='.dbg/word-image-table-loop.env';let u='http://127.0.0.1:7777/event',s='word-image-table-loop';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}const mats=Array.isArray(finalData.sp_materiel_detail)?finalData.sp_materiel_detail:[];await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'D',location:'preview-word/route.ts:before-render',msg:'[DEBUG] before render with material detail image tags',data:{materielCount:mats.length,materielSample:mats.slice(0,3),hasAnyImageUrl:mats.some((m)=>typeof (m as Record<string, unknown>)?.sp_matd_image_url==='string'&&String((m as Record<string, unknown>)?.sp_matd_image_url).length>0)},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      await doc.renderAsync(finalData);

      uint8Array = doc.getZip().generate({
        type: 'uint8array',
        compression: 'DEFLATE',
      });
    } catch (error) {
      const e = error as { message?: string; properties?: { errors?: Array<{ properties?: { explanation?: string } }> } };
      // #region debug-point B:render-error-image-loop
      await (async()=>{const fs=require('node:fs'),p='.dbg/word-image-table-loop.env';let u='http://127.0.0.1:7777/event',s='word-image-table-loop';try{const env=fs.readFileSync(p,'utf8');u=env.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=env.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'post-fix',hypothesisId:'B',location:'preview-word/route.ts:catch',msg:'[DEBUG] word preview render error',data:{message:(error as Error)?.message,stack:(error as Error)?.stack,properties:(error as { properties?: unknown })?.properties},ts:Date.now()})}).catch(()=>{})})();
      // #endregion
      const rawMessage = e?.message || (error as Error)?.message || '';
      if (rawMessage.includes("reading 'part'")) {
        return NextResponse.json(
          {
            error: 'Erreur lors du remplissage du document',
            details: "Le tag image Word semble mal place. Placez {{%sp_matd_image_url}} seul dans son paragraphe ou sa cellule, sans autre texte ni variable sur la meme ligne.",
          },
          { status: 400 }
        );
      }
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
