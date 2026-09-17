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
import { isAllowedFetchUrl } from '@/lib/security/validate-fetch-url';
import { makeUppercaseParser } from './word-case';

type ImageModuleOptions = {
  centered?: boolean;
  fileType?: string;
  getImage: (tagValue: string) => Buffer;
  getSize: (img: Buffer, tagValue: string) => [number, number];
};
type ImageModuleCtor = new (opts: ImageModuleOptions) => object;
type DocxModule = Parameters<Docxtemplater['attachModule']>[0];
// `docxtemplater-image-module` est déprécié par son auteur (dernière release
// non maintenue, dépend de `xmldom` — 2 CVE critiques d'injection XML) et son
// seul successeur gratuit compatible avec `docxtemplater` >= 3.x sans cette
// dépendance vulnérable est ce fork : dépend de `@xmldom/xmldom` (patché) et
// corrige nativement le bug `scopeManager.getValue` sans le 2e argument `meta`
// qui obligeait ce fichier à monkey-patcher le module (`PatchedImageModule`,
// supprimé ici). Testé avant migration : rendu identique (boucles + images).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImageModule = require('docxtemplater-image') as ImageModuleCtor;

// 1×1 transparent PNG — placeholder quand aucune URL d'image n'est fournie.
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// Détecte les propriétés de données qui contiennent une URL d'image.
const IMAGE_FIELD_RE = /image_url$/i;

// Boîte maximale (px) pour chaque image rendue dans le Word — notamment les
// photos produit du tableau matériel ({{#sp_materiel_detail}} / {{%sp_matd_image_url}}).
// Les images sont mises à l'échelle pour tenir dans cette boîte en conservant
// leur ratio d'origine (pas de déformation) ; ajuster ces deux valeurs pour
// agrandir/réduire la taille maximale.
const IMAGE_MAX_SIZE_PX: [number, number] = [110, 73];

function looksLikeImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/** Lit les dimensions (largeur, hauteur) d'un buffer PNG/JPEG/GIF/WebP. `null` si non reconnu. */
function readImageDimensions(buf: Buffer): [number, number] | null {
  try {
    // PNG : signature 8 octets puis chunk IHDR (largeur/hauteur en big-endian sur 4 octets chacun).
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    }
    // GIF : "GIF87a"/"GIF89a" puis largeur/hauteur en little-endian sur 2 octets chacun.
    if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
      return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
    }
    // WebP : conteneur RIFF/WEBP, on ne gère que VP8X (le plus courant pour des photos produit).
    if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') {
        return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
      }
      if (chunk === 'VP8 ') {
        return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
      }
    }
    // JPEG : parcours des marqueurs jusqu'au SOFn (largeur/hauteur en big-endian).
    if (buf.length >= 4 && buf.readUInt16BE(0) === 0xffd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf.readUInt8(offset) !== 0xff) break;
        const marker = buf.readUInt8(offset + 1);
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const segmentLength = buf.readUInt16BE(offset + 2);
        const isSofMarker = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSofMarker) {
          return [buf.readUInt16BE(offset + 7), buf.readUInt16BE(offset + 5)];
        }
        offset += 2 + segmentLength;
      }
    }
  } catch {
    // Buffer tronqué/corrompu : on retombe sur la taille par défaut.
  }
  return null;
}

/** Taille (px) d'une image mise à l'échelle pour tenir dans `box` en conservant son ratio. */
function computeContainSize(img: Buffer, box: [number, number]): [number, number] {
  const dims = readImageDimensions(img);
  if (!dims || !dims[0] || !dims[1]) return box;
  const [width, height] = dims;
  const scale = Math.min(box[0] / width, box[1] / height);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
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
  /**
   * Résout une balise absente du dictionnaire de données (variables « dynamiques »
   * dont un paramètre est encodé dans le nom, ex. `sp_date_limite_souscription-15`).
   * Renvoie `undefined` pour laisser le comportement par défaut (chaîne vide).
   */
  resolveMissingVar?: (tag: string) => string | undefined;
  /**
   * Si vrai : toutes les variables texte ({{...}}) du document généré sont rendues
   * en MAJUSCULES. Le texte fixe du modèle n'est pas modifié. Défaut : false.
   */
  uppercaseVariables?: boolean;
};

async function defaultFetchImage(url: string): Promise<Buffer> {
  if (!url || !isAllowedFetchUrl(url)) return PLACEHOLDER_PNG;
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
  const resolveMissingVar = options.resolveMissingVar;
  const uppercaseVariables = options.uppercaseVariables ?? false;
  // Appliquée aussi aux variables résolues via `resolveMissingVar` (le parser ne
  // voit que les clés présentes dans les données), pour un rendu homogène.
  const applyCase = (s: string) => (uppercaseVariables ? s.toLocaleUpperCase('fr-FR') : s);

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
    // C'est la passe qui substitue le texte : le parser majuscules s'applique ici.
    ...(uppercaseVariables ? { parser: makeUppercaseParser() } : {}),
    // Ré-émet les balises image `%` non résolues (images hors boucle) afin que
    // la passe 2 puisse les rendre. Sinon : variable dynamique éventuelle, puis "".
    nullGetter: (part?: { value?: string; module?: string }) => {
      const v = part?.value;
      if (typeof v !== 'string') return '';
      if (v.startsWith('%')) return `{{${v}}}`;
      const dynamic = resolveMissingVar?.(v);
      return dynamic !== undefined ? applyCase(dynamic) : '';
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
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage,
    getSize: (img) => computeContainSize(img, IMAGE_MAX_SIZE_PX),
  });
  const doc2 = new Docxtemplater(zip2, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule as unknown as DocxModule],
    delimiters: { start: '{{', end: '}}' },
    nullGetter: (part?: { value?: string }) => {
      const v = part?.value;
      if (typeof v !== 'string') return '';
      const dynamic = resolveMissingVar?.(v);
      return dynamic !== undefined ? applyCase(dynamic) : '';
    },
  });
  // Données passe 2 : table token → URL + données d'origine (images hors boucle).
  doc2.render({ ...data, ...flatImages });

  return doc2.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
}
