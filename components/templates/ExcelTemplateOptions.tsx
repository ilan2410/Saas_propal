'use client';

import { useState } from 'react';
import type { ExcelConfig } from '@/types';

interface Props {
  config: ExcelConfig;
  fields: string[];
  onChange: (config: ExcelConfig) => void;
}

export function ExcelTemplateOptions({ config, fields, onChange }: Props) {
  const [days, setDays] = useState(15);
  const [selectedField, setSelectedField] = useState('');
  const dynamicFields = Object.keys(config.fieldTypes ?? {}).filter(key => key.startsWith('sp_date_limite_souscription'));
  const available = Array.from(new Set([...fields, ...dynamicFields])).sort();
  const field = available.includes(selectedField) ? selectedField : available[0] ?? '';
  const update = (changes: Partial<ExcelConfig>) => onChange({ ...config, ...changes });
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <h4 className="font-semibold text-gray-900">Options du template Excel</h4>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={config.preserverFormules !== false} onChange={e => update({ preserverFormules: e.target.checked })} />
        Protéger les cellules contenant des formules
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={config.forcerMajusculesVariables === true} onChange={e => update({ forcerMajusculesVariables: e.target.checked })} />
        Mettre les valeurs texte en majuscules (les emails et le texte fixe sont conservés)
      </label>
      <div className="rounded-lg bg-gray-50 p-4 space-y-3">
      <p className="text-sm font-medium text-gray-900">Comment Excel doit traiter une donnée (facultatif)</p>
      <p className="text-sm text-gray-600">Aucune valeur à saisir ici : les données viennent de votre proposition. Laissez « Automatique » sauf si vous voulez imposer un format pour un champ précis.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Donnée à configurer
          <select className="mt-1 w-full rounded border p-2" value={field} onChange={e => setSelectedField(e.target.value)}>
            {available.map(key => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
        <label className="text-sm">Traitement dans Excel
          <select className="mt-1 w-full rounded border p-2" value={config.fieldTypes?.[field] ?? ''} disabled={!field}
            onChange={e => {
              const next = { ...config.fieldTypes };
              if (e.target.value) next[field] = e.target.value as NonNullable<ExcelConfig['fieldTypes']>[string];
              else delete next[field];
              update({ fieldTypes: next });
            }}>
            <option value="">Automatique</option>
            <option value="text">Texte / identifiant</option>
            <option value="number">Nombre / montant</option>
            <option value="date">Date</option>
            <option value="boolean">Oui / non</option>
            <option value="image">Image (PNG, JPEG, GIF)</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-600">Exemples : « Texte / identifiant » conserve le zéro d’un téléphone ; « Nombre / montant » permet les calculs ; « Date » affiche une date ; « Image » insère un logo ou une photo. Pour une adresse, gardez « Automatique ».</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Date limite : jours après la création
          <input type="number" min={0} max={9999} value={days} className="mt-1 block w-28 rounded border p-2"
            onChange={e => setDays(Math.max(0, Math.min(9999, Number(e.target.value))))} />
        </label>
        <button type="button" className="rounded border border-blue-300 px-3 py-2 text-sm text-blue-700" onClick={() => {
          const key = days ? `sp_date_limite_souscription-${days}` : 'sp_date_limite_souscription';
          update({ fieldTypes: { ...config.fieldTypes, [key]: 'date' } });
          setSelectedField(key);
        }}>Ajouter cette date au mapping</button>
      </div>
      <p className="text-xs text-gray-600">Avec 15 jours, une proposition créée le 1er octobre aura une date limite au 16 octobre. Le bouton ajoute cette donnée à la liste des champs : vous choisissez ensuite sa cellule dans le mapping.</p>
      <div className="flex flex-wrap gap-4">
        {(['imageWidth', 'imageHeight'] as const).map(key => (
          <label key={key} className="text-sm">{key === 'imageWidth' ? 'Largeur maximale des images' : 'Hauteur maximale des images'} (px)
            <input type="number" min={1} max={1000} value={config[key] ?? (key === 'imageWidth' ? 110 : 73)}
              className="mt-1 block w-28 rounded border p-2" onChange={e => update({ [key]: Math.max(1, Math.min(1000, Number(e.target.value))) })} />
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-600">
        Vous pouvez aussi écrire {'{{variable}}'} dans une phrase d’une cellule.
        Pour une image, utilisez une cellule dédiée au mapping ou {'{{%variable_image_url}}'} seul dans la cellule.
        Les images doivent être hébergées dans le stockage du projet.
      </p>
    </div>
  );
}
