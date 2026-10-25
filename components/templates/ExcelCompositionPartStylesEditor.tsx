'use client';

import { composedFields } from '@/lib/excel/template-config';
import type { ExcelCompositionPartStyle } from '@/types';

interface Props {
  template: string;
  styles?: Record<string, ExcelCompositionPartStyle>;
  onChange: (styles: Record<string, ExcelCompositionPartStyle>) => void;
}

export function ExcelCompositionPartStylesEditor({ template, styles, onChange }: Props) {
  const fields = [...new Set(composedFields(template) ?? [])];
  if (!fields.length) return null;

  const update = (field: string, patch: Partial<ExcelCompositionPartStyle>) => {
    const style = { ...styles?.[field], ...patch };
    for (const key of Object.keys(style) as Array<keyof ExcelCompositionPartStyle>) {
      if (style[key] === undefined) delete style[key];
    }
    const next = { ...styles };
    if (Object.keys(style).length) next[field] = style;
    else delete next[field];
    onChange(next);
  };

  return (
    <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <p className="text-xs font-semibold text-gray-800">Mise en forme par variable</p>
      {fields.map(field => (
        <div key={field} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{`{{${field}}}`}</span>
          <label className="text-xs font-medium text-gray-700">
            Gras
            <select aria-label={`${field} : gras dans la composition`} className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500" value={styles?.[field]?.bold === undefined ? '' : String(styles[field].bold)} onChange={e => update(field, { bold: e.target.value === '' ? undefined : e.target.value === 'true' })}>
              <option value="">De la cellule</option><option value="true">Oui</option><option value="false">Non</option>
            </select>
          </label>
          <label className="text-xs font-medium text-gray-700">
            Taille (pt)
            <input aria-label={`${field} : taille dans la composition`} className="ml-1 w-20 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500" type="number" min="1" max="409" step="1" placeholder="Cellule" value={styles?.[field]?.fontSize ?? ''} onChange={e => update(field, { fontSize: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
        </div>
      ))}
      <p className="text-xs text-gray-600">Pour un titre en gras et une description normale, choisissez « Oui » pour le titre et « Non » pour la description.</p>
    </div>
  );
}
