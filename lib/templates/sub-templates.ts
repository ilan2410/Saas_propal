export interface SubTemplate {
 id: string; template_id: string; organization_id: string; nom: string;
 file_type: 'word' | 'excel'; file_url: string; file_name: string;
 file_size_mb: number; file_config: Record<string, unknown>;
}
export type SubTemplateMode = 'all' | 'choose';
export const DOCUMENT_CONFIG_KEYS = [
 'sheetMappings', 'arrayMappings', 'composedMappings', 'fieldMappings', 'cellMappings',
 'fieldTypes', 'imageWidth', 'imageHeight', 'multiSheet', 'sheetCount',
 'formatVariables', 'feuilleCiblee', 'preserverFormules', 'cellulesAvecFormules',
 'tableauxDynamiques', 'imagesARemplacer', 'forcerMajusculesVariables',
 'prioriserLignesAvecNumero', 'champsFormulaire',
] as const;
export function documentConfig(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
 const config = value as Record<string, unknown>;
 return Object.fromEntries(DOCUMENT_CONFIG_KEYS.filter(key => key in config).map(key => [key, config[key]]));
}
export function subTemplateConfig(parent: unknown, own: unknown): Record<string, unknown> {
 const inherited: Record<string, unknown> = parent && typeof parent === 'object' ? { ...parent } : {};
 for (const key of DOCUMENT_CONFIG_KEYS) delete inherited[key];
 return { ...inherited, ...documentConfig(own) };
}
export function resolveSubTemplateSelection(ids: string[], mode: SubTemplateMode, saved: string[] | null, explicit?: string[]): string[] {
 const selected = explicit ?? (mode === 'all' ? ids : saved ?? ids);
 return ids.filter(id => selected.includes(id));
}

export interface SubTemplateGenerationResult {
 id: string; nom: string; status: 'success' | 'error'; file_url?: string; error?: string;
}

/** Existing configured annexes remain enabled until explicitly switched off. */
export function subTemplatesEnabled(config: unknown, count: number): boolean {
 const value = config && typeof config === 'object' ? (config as Record<string, unknown>).sub_templates_enabled : undefined;
 return typeof value === 'boolean' ? value : count > 0;
}
