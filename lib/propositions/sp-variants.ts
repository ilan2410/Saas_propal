/** Only SP and editable billing identity belong to a variant. SA stays on the parent. */
export type SpVariant = {
  id: string;
  nom: string;
  suggestions_sp_completes: unknown;
  sp_reponses: unknown;
  filled_data: Record<string, unknown>;
  duplicated_template_url: string | null;
  selected_sub_template_ids: string[] | null;
};

export function variantClientData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => key === 'client' || key.startsWith('client.')));
}

export function applySpVariant<T extends Record<string, unknown>>(parent: T, variant: SpVariant): T {
  return { ...parent,
    suggestions_sp_completes: variant.suggestions_sp_completes,
    sp_reponses: variant.sp_reponses,
    filled_data: { ...(parent.filled_data as Record<string, unknown> ?? {}), ...variantClientData(variant.filled_data) },
    duplicated_template_url: variant.duplicated_template_url,
    fichier_genere_url: null,
    selected_sub_template_ids: variant.selected_sub_template_ids,
  };
}

export function validVariantName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
}

export function variantFileSuffix(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}
