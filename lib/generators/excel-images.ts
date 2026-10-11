import ExcelJS from 'exceljs';
import { assertAllowedFetchUrl } from '@/lib/security/validate-fetch-url';

type ExcelImage = { bytes: Buffer; extension: 'png' | 'jpeg' | 'gif'; width: number; height: number };
const MAX_BYTES = 5 * 1024 * 1024;

export async function loadExcelImage(url: string): Promise<ExcelImage> {
  assertAllowedFetchUrl(url);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Impossible de charger l'image (${response.status}).`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Image trop volumineuse (maximum 5 Mo).');
  const reader = response.body?.getReader();
  if (!reader) throw new Error("L'image est vide.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Image trop volumineuse (maximum 5 Mo).');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { bytes, extension: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) {
    return { bytes, extension: 'gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { bytes, extension: 'jpeg', width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  throw new Error('Image Excel non prise en charge : utilisez PNG, JPEG ou GIF.');
}

/** ExcelJS has no public removeImage method; isolate the supported media-model access. */
export function clearExcelCellImages(worksheet: ExcelJS.Worksheet, cell: ExcelJS.Cell) {
  const media = worksheet as unknown as { _media: Array<{ type: string; range?: { tl?: { nativeRow: number; nativeCol: number } } }> };
  media._media = media._media.filter(image => image.type !== 'image' || image.range?.tl?.nativeRow !== Number(cell.row) - 1 || image.range?.tl?.nativeCol !== Number(cell.col) - 1);
}

export function addExcelImage(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, image: ExcelImage, width = 110, height = 73) {
  if (!image.width || !image.height) throw new Error("Dimensions de l'image invalides.");
  const scale = Math.min(width / image.width, height / image.height);
  const ext = { width: image.width * scale, height: image.height * scale };
  const imageId = workbook.addImage({ buffer: image.bytes as unknown as ExcelJS.Buffer, extension: image.extension });
  worksheet.addImage(imageId, {
    tl: { col: Number(cell.col) - 1, row: Number(cell.row) - 1 }, ext, editAs: 'oneCell',
  });
  worksheet.getRow(Number(cell.row)).height = Math.max(worksheet.getRow(Number(cell.row)).height ?? 15, ext.height * 0.75);
}
