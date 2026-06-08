// Rendu Word avec support des images, y compris à l'intérieur des boucles
// (ex: {{#sp_materiel_detail}} ... {{%sp_matd_image_url}} ... {{/sp_materiel_detail}}).
//
// Le module gratuit `docxtemplater-image-module` ne sait pas rendre une balise
// image `{{%...}}` placée dans une boucle de tableau : son `postparse` tente
// d'étendre la balise à un `w:t` unique et échoue (« Cannot read properties of
// undefined (reading 'part') ») lorsque la boucle est répartie sur plusieurs
// cellules. On contourne cette limite via un rendu en DEUX passes :
//
//   Passe 1 (sans module image) : docxtemplater déroule les boucles et le texte
//   normalement (le texte en boucle fonctionne). Chaque balise image de boucle
//   est remplacée, pour chaque itération, par une balise image PLATE et UNIQUE
//   (`{{%__wimg_N}}`). Les balises `%` non résolues (images hors boucle) sont
//   ré-émises telles quelles grâce au `nullGetter`.
//
//   Passe 2 (avec module image) : toutes les balises image sont désormais plates
//   (hors boucle, seules dans leur run) ; le module image les rend sans crash.
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

type ImageModuleOptions = {
  centered?: boolean;
  fileType?: string;
  getImage: (tagValue: string) => Buffer;
  getSize: (img: Buffer, tagValue: string) => [number, number];
};
type RenderOptions = { scopeManager: { getValue: (tag: string, meta?: unknown) => unknown } };
interface ImageModuleInstance {
  render(part: unknown, options: RenderOptions): unknown;
}
type ImageModuleCtor = new (opts: ImageModuleOptions) => ImageModuleInstance;
type DocxModule = Parameters<Docxtemplater['attachModule']>[0];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BaseImageModule = require('docxtemplater-image-module') as ImageModuleCtor;

// `docxtemplater-image-module@3.1.0` (version gratuite) est incompatible avec
// docxtemplater >= 3.x : son `render` appelle `scopeManager.getValue(part.value)`
// sans le 2e argument `meta`, alors que docxtemplater fait `meta.part.lIndex`
// (=> « Cannot read properties of undefined (reading 'part') »). On corrige en
// fournissant un `scopeManager` proxy qui injecte `{ part }` quand il manque.
class PatchedImageModule extends BaseImageModule {
  render(part: unknown, options: RenderOptions) {
    const sm = options.scopeManager;
    const proxy = Object.create(sm) as typeof sm;
    proxy.getValue = (tag: string, meta?: unknown) => sm.getValue(tag, meta ?? { part });
    return super.render(part, { ...options, scopeManager: proxy });
  }
}

// 1×1 transparent PNG — placeholder quand aucune URL d'image n'est fournie.
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// Détecte les propriétés de données qui contiennent une URL d'image.
const IMAGE_FIELD_RE = /image_url$/i;

function looksLikeImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

type FlatImageMap = Record<string, string>;

/**
 * Clone la donnée et injecte, pour chaque propriété image rencontrée (dans les
 * boucles comme au niveau racine), une clé `%<champ>` pointant vers une balise
 * image plate et unique (`{{%__wimg_N}}`). Renvoie aussi la table token → URL.
 *
 * Pourquoi `%<champ>` ? En passe 1 le module image est absent : docxtemplater
 * interprète `{{%sp_matd_image_url}}` comme une variable nommée littéralement
 * `%sp_matd_image_url`. En lui fournissant cette clé sur chaque item de boucle,
 * on émet une balise image plate distincte par itération.
 */
function injectLoopImageTokens(input: unknown, flat: FlatImageMap, counter: { n: number }): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => injectLoopImageTokens(item, flat, counter));
  }
  if (input && typeof input === 'object') {
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      out[key] = injectLoopImageTokens(value, flat, counter);
      if (IMAGE_FIELD_RE.test(key) && looksLikeImageUrl(value)) {
        const token = `__wimg_${counter.n++}`;
        flat[token] = value;
        // Clé littérale avec `%` : référencée par la balise `{{%<champ>}}`.
        out[`%${key}`] = `{{%${token}}}`;
      }
    }
    return out;
  }
  return input;
}

export type RenderWordOptions = {
  /** Récupère le buffer d'une image depuis son URL. Par défaut: fetch HTTP. */
  fetchImage?: (url: string) => Promise<Buffer>;
};

async function defaultFetchImage(url: string): Promise<Buffer> {
  if (!url || !/^https?:\/\//.test(url)) return PLACEHOLDER_PNG;
  try {
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return PLACEHOLDER_PNG;
  }
}

/**
 * Rend un template Word (.docx) avec données + images, y compris les images
 * placées dans des boucles de tableau. Renvoie le binaire du document rempli.
 */
export async function renderWordWithImages(
  templateBuffer: ArrayBuffer | Buffer,
  data: Record<string, unknown>,
  options: RenderWordOptions = {},
): Promise<Uint8Array> {
  const fetchImage = options.fetchImage ?? defaultFetchImage;

  // --- Préparation : injecter les balises image plates par itération ---
  const flatImages: FlatImageMap = {};
  const pass1Data = injectLoopImageTokens(data, flatImages, { n: 0 }) as Record<string, unknown>;

  // --- Passe 1 : déroulage des boucles et du texte, SANS module image ---
  const templateNodeBuffer = Buffer.isBuffer(templateBuffer)
    ? templateBuffer
    : Buffer.from(new Uint8Array(templateBuffer));
  const zip1 = new PizZip(templateNodeBuffer);
  const doc1 = new Docxtemplater(zip1, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    // Ré-émet les balises image `%` non résolues (images hors boucle) afin que
    // la passe 2 puisse les rendre. Les autres variables manquantes -> "".
    nullGetter: (part?: { value?: string; module?: string }) => {
      const v = part?.value;
      if (typeof v === 'string' && v.startsWith('%')) return `{{${v}}}`;
      return '';
    },
  });
  await doc1.renderAsync(pass1Data);
  const intermediate = doc1.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  // --- Pré-téléchargement des images (le module image rend de façon synchrone) ---
  const uniqueUrls = Array.from(new Set(Object.values(flatImages)));
  const buffers = new Map<string, Buffer>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      buffers.set(url, await fetchImage(url));
    }),
  );
  const getImage = (url: string): Buffer => buffers.get(url) ?? PLACEHOLDER_PNG;

  // --- Passe 2 : rendu des balises image (désormais toutes plates) ---
  const zip2 = new PizZip(intermediate);
  const imageModule = new PatchedImageModule({
    centered: false,
    fileType: 'docx',
    getImage,
    getSize: () => [150, 100] as [number, number],
  });
  const doc2 = new Docxtemplater(zip2, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule as unknown as DocxModule],
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  // Données passe 2 : table token → URL + données d'origine (images hors boucle).
  doc2.render({ ...data, ...flatImages });

  return doc2.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
}
