'use client';

import type { ExcelFieldStyle } from '@/types';

interface Props {
  field: string;
  style?: ExcelFieldStyle;
  onChange: (style: ExcelFieldStyle | undefined) => void;
}

export function ExcelFieldStyleEditor({ field, style, onChange }: Props) {
  const update = (patch: Partial<ExcelFieldStyle>) => {
    const next = { ...style, ...patch };
    for (const key of Object.keys(next) as Array<keyof ExcelFieldStyle>) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(Object.keys(next).length ? next : undefined);
  };
  const selectClass = 'w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <div onClick={event => event.stopPropagation()} className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-200 pt-3 sm:grid-cols-3">
      <label className="text-xs font-medium text-gray-700">
        Alignement horizontal
        <select aria-label={`${field} : alignement horizontal`} className={selectClass} value={style?.horizontal ?? ''} onChange={e => update({ horizontal: e.target.value ? e.target.value as ExcelFieldStyle['horizontal'] : undefined })}>
          <option value="">Du modèle</option><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option>
        </select>
      </label>
      <label className="text-xs font-medium text-gray-700">
        Alignement vertical
        <select aria-label={`${field} : alignement vertical`} className={selectClass} value={style?.vertical ?? ''} onChange={e => update({ vertical: e.target.value ? e.target.value as ExcelFieldStyle['vertical'] : undefined })}>
          <option value="">Du modèle</option><option value="top">Haut</option><option value="middle">Centré</option><option value="bottom">Bas</option>
        </select>
      </label>
      <label className="text-xs font-medium text-gray-700">
        Gras
        <select aria-label={`${field} : gras`} className={selectClass} value={style?.bold === undefined ? '' : String(style.bold)} onChange={e => update({ bold: e.target.value === '' ? undefined : e.target.value === 'true' })}>
          <option value="">Du modèle</option><option value="true">Oui</option><option value="false">Non</option>
        </select>
      </label>
      <label className="text-xs font-medium text-gray-700">
        Taille de police (pt)
        <input aria-label={`${field} : taille de police`} className={selectClass} type="number" min="1" max="409" step="1" placeholder="Du modèle" value={style?.fontSize ?? ''} onChange={e => update({ fontSize: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </label>
      <label className="text-xs font-medium text-gray-700">
        Hauteur de ligne (pt)
        <input aria-label={`${field} : hauteur de ligne`} className={selectClass} type="number" min="1" max="409" step="1" placeholder="Du modèle" value={style?.rowHeight ?? ''} onChange={e => update({ rowHeight: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </label>
      <p className="self-end text-xs text-gray-600">La hauteur s&apos;applique à toute la ligne Excel. Si plusieurs champs la définissent, la plus grande valeur l&apos;emporte.</p>
    </div>
  );
}
