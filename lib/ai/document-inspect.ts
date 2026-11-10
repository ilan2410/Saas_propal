// Lecture des métadonnées d'un document (pages d'un PDF, dimensions d'une image)
// pour alimenter `checkDocumentLimits`. Isomorphe : navigateur et serveur.
import type { DocumentInfo } from '@/lib/ai/document-limits';

export function getImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  // PNG
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // GIF
  if (bytes.length >= 10 && ascii(0, 3) === 'GIF') {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  // WebP
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    }
    if (chunk === 'VP8 ') {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG : on cherche un marqueur SOFn
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return null;
}

export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

export async function inspectDocument(
  name: string,
  kind: DocumentInfo['kind'],
  bytes: Uint8Array,
): Promise<DocumentInfo> {
  if (kind === 'pdf') {
    const pages = await countPdfPages(bytes);
    return { name, kind, bytes: bytes.byteLength, ...(pages !== null ? { pages } : {}) };
  }
  const dims = getImageDimensions(bytes);
  return { name, kind, bytes: bytes.byteLength, ...(dims ?? {}) };
}
