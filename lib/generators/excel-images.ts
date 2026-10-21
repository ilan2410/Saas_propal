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
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    // Excel (via ExcelJS) cannot embed WebP, the format of catalogue images: convert to PNG.
    try {
      const { default: sharp } = await import('sharp');
      const { data, info } = await sharp(bytes).png().toBuffer({ resolveWithObject: true });
      return { bytes: data, extension: 'png', width: info.width, height: info.height };
    } catch {
      throw new Error("Impossible de convertir l'image WebP pour Excel. Utilisez PNG, JPEG ou GIF.");
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
  return ext;
}

const EMU_PER_PIXEL = 9525;

/** Place an image against the right edge of the cell (or of its merged area), vertically centred. */
export function addExcelImageRightCentered(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, image: ExcelImage, width = 110, height = 73) {
  if (!image.width || !image.height) throw new Error("Dimensions de l'image invalides.");
  const scale = Math.min(width / image.width, height / image.height);
  const ext = { width: image.width * scale, height: image.height * scale };
  const margin = 8;
  // Gap kept between the picture and the right edge, so it sits inside the column rather than against the next one.
  const rightGap = 100;

  // Merged area of the cell (the cell is the master of its merge, if any).
  const firstCol = Number(cell.col);
  const firstRow = Number(cell.row);
  let [lastCol, lastRow] = [firstCol, firstRow];
  for (const range of worksheet.model.merges ?? []) {
    const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(range);
    if (!match) continue;
    const column = (letters: string) => letters.toUpperCase().split('').reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
    if (column(match[1]) === firstCol && +match[2] === firstRow) { lastCol = column(match[3]); lastRow = +match[4]; break; }
  }
  const columnPixels = (col: number) => Math.round((worksheet.getColumn(col).width ?? worksheet.properties.defaultColWidth ?? 8.43) * 7 + 5);
  const rowPixels = (row: number) => Math.round((worksheet.getRow(row).height ?? worksheet.properties.defaultRowHeight ?? 15) * 4 / 3);
  const sum = (from: number, to: number, size: (index: number) => number) => { let total = 0; for (let i = from; i <= to; i++) total += size(i); return total; };

  // Grow the first row if the merged area is too short for the picture.
  const missing = ext.height + margin - sum(firstRow, lastRow, rowPixels);
  if (missing > 0) worksheet.getRow(firstRow).height = (worksheet.getRow(firstRow).height ?? worksheet.properties.defaultRowHeight ?? 15) + missing * 0.75;

  const areaWidth = sum(firstCol, lastCol, columnPixels);
  const areaHeight = sum(firstRow, lastRow, rowPixels);
  const walk = (start: number, offset: number, size: (index: number) => number) => {
    let index = start;
    while (offset >= size(index) && index < 16384) { offset -= size(index); index++; }
    return { index, offset };
  };
  const x = walk(firstCol, Math.max(0, areaWidth - ext.width - rightGap), columnPixels);
  const y = walk(firstRow, Math.max(0, (areaHeight - ext.height) / 2), rowPixels);
  const imageId = workbook.addImage({ buffer: image.bytes as unknown as ExcelJS.Buffer, extension: image.extension });
  worksheet.addImage(imageId, {
    tl: { nativeCol: x.index - 1, nativeColOff: Math.round(x.offset * EMU_PER_PIXEL), nativeRow: y.index - 1, nativeRowOff: Math.round(y.offset * EMU_PER_PIXEL) },
    ext, editAs: 'oneCell',
  } as unknown as ExcelJS.ImageRange);
  return ext;
}
