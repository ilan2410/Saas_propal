function filePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

/** Uniqueness belongs to the storage directory, never the downloaded filename. */
export function generatedFileName(client: string, extension: 'xlsx' | 'docx', documentName?: string, variantName?: string) {
  return [filePart(documentName || 'Propal') || 'Propal', filePart(client) || 'Client', variantName ? filePart(variantName) : '']
    .filter(Boolean).join('_') + '.' + extension;
}
