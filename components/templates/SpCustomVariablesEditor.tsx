'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Edit2, Check, X } from 'lucide-react';
import type { SpVariableCustom } from '@/types';

interface RowField {
  id: string;
  label: string;
  type: 'string' | 'number' | 'date';
}

interface Props {
  templateId: string;
  fileConfig: Record<string, unknown>;
  onSaved: (updatedConfig: Record<string, unknown>) => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[éèê]/g, 'e')
    .replace(/[àâ]/g, 'a')
    .replace(/[ùû]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/[îï]/g, 'i')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

const EMPTY_VAR: Omit<SpVariableCustom, 'key'> & { key: string } = {
  key: '',
  label: '',
  description: '',
  type: 'string',
  rowFields: [],
};

function VariableForm({
  initial,
  existingKeys,
  onSave,
  onCancel,
}: {
  initial: SpVariableCustom;
  existingKeys: string[];
  onSave: (v: SpVariableCustom) => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial.key;
  const [key, setKey] = useState(initial.key);
  const [label, setLabel] = useState(initial.label);
  const [description, setDescription] = useState(initial.description);
  const [type, setType] = useState<SpVariableCustom['type']>(initial.type);
  const [rowFields, setRowFields] = useState<RowField[]>(initial.rowFields ?? []);
  const [newField, setNewField] = useState<RowField>({ id: '', label: '', type: 'string' });

  const autoKey = `sp_${slugify(label)}`;
  const resolvedKey = key || autoKey;
  const keyError =
    !resolvedKey.startsWith('sp_')
      ? 'La clé doit commencer par sp_'
      : !isEdit && existingKeys.includes(resolvedKey)
      ? 'Cette clé existe déjà'
      : '';

  const canSave = label.trim() && !keyError;

  const addRowField = () => {
    if (!newField.label.trim()) return;
    const id = newField.id || slugify(newField.label);
    setRowFields((prev) => [...prev, { ...newField, id }]);
    setNewField({ id: '', label: '', type: 'string' });
  };

  const removeRowField = (idx: number) => {
    setRowFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!canSave) return;
    onSave({
      key: resolvedKey,
      label: label.trim(),
      description: description.trim(),
      type,
      rowFields: type === 'tableau' ? rowFields : undefined,
    });
  };

  return (
    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-4">
      <h4 className="text-sm font-semibold text-blue-900">
        {isEdit ? 'Modifier la variable' : 'Nouvelle variable SP custom'}
      </h4>

      {/* Label */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Libellé *</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex: Nombre de postes téléphoniques"
          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Key */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Clé (variable Word) *
          <span className="text-gray-400 font-normal ml-1">— auto-générée depuis le libellé si vide</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={autoKey}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <code className="text-xs text-blue-700 bg-white border border-blue-200 rounded px-2 py-1 font-mono whitespace-nowrap">
            {`{{${resolvedKey}}}`}
          </code>
        </div>
        {keyError && <p className="text-xs text-red-600 mt-1">{keyError}</p>}
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
        <div className="flex gap-2">
          {(['string', 'number', 'tableau'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {t === 'string' ? 'Texte' : t === 'number' ? 'Nombre' : 'Tableau'}
            </button>
          ))}
        </div>
        {type === 'tableau' && (
          <p className="text-xs text-gray-500 mt-1">
            Génère un bloc <code>{`{{#${resolvedKey}}}...{{/${resolvedKey}}}`}</code> avec des sous-champs.
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description (optionnel)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Aide pour l'IA ou les utilisateurs"
          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Champs du tableau */}
      {type === 'tableau' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">Sous-champs du tableau</p>
          {rowFields.length > 0 && (
            <div className="space-y-1">
              {rowFields.map((rf, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 rounded px-2 py-1">
                  <code className="text-xs text-blue-700 font-mono flex-1">{`{{${rf.id}}}`}</code>
                  <span className="text-xs text-gray-600">{rf.label}</span>
                  <span className="text-xs text-gray-400">({rf.type})</span>
                  <button onClick={() => removeRowField(idx)} className="text-red-400 hover:text-red-600 ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                value={newField.label}
                onChange={(e) => setNewField((f) => ({ ...f, label: e.target.value, id: slugify(e.target.value) }))}
                placeholder="Libellé du champ (ex: Quantité)"
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRowField(); } }}
              />
            </div>
            <select
              value={newField.type}
              onChange={(e) => setNewField((f) => ({ ...f, type: e.target.value as RowField['type'] }))}
              className="px-2 py-1 border border-gray-300 rounded text-xs"
            >
              <option value="string">Texte</option>
              <option value="number">Nombre</option>
              <option value="date">Date</option>
            </select>
            <button
              type="button"
              onClick={addRowField}
              disabled={!newField.label.trim()}
              className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              + Ajouter
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSave}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Check className="w-3 h-3" />
          {isEdit ? 'Mettre à jour' : 'Créer la variable'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
        >
          <X className="w-3 h-3" />
          Annuler
        </button>
      </div>
    </div>
  );
}

export function SpCustomVariablesEditor({ templateId, fileConfig, onSaved }: Props) {
  const currentVars: SpVariableCustom[] = Array.isArray(fileConfig.spVariablesCustom)
    ? (fileConfig.spVariablesCustom as SpVariableCustom[])
    : [];

  const [vars, setVars] = useState<SpVariableCustom[]>(currentVars);
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [usedVariables, setUsedVariables] = useState<Set<string>>(new Set());

  // Re-fetch from API on mount to pick up variables created elsewhere (e.g. SpQuestionBuilder)
  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}/sp-variables`)
      .then((r) => r.json())
      .then((data: { standard: string[]; custom: SpVariableCustom[] }) => {
        setVars(data.custom ?? []);
      })
      .catch(() => {});
  }, [templateId]);

  // Fetch SP questions to detect which variables are actually used
  useEffect(() => {
    if (!templateId) return;
    fetch(`/api/templates/${templateId}/sp-questions`)
      .then((r) => r.json())
      .then((data: { questions: Array<{ consequences?: Array<{ type: string; variable_cible?: string }> }> }) => {
        const used = new Set<string>();
        for (const q of data.questions ?? []) {
          for (const c of q.consequences ?? []) {
            if (c.type === 'renseigner_variable' && c.variable_cible) {
              used.add(c.variable_cible);
            }
          }
        }
        setUsedVariables(used);
      })
      .catch(() => {});
  }, [templateId]);

  const persistVars = async (updated: SpVariableCustom[]) => {
    if (!templateId) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const newConfig = { ...fileConfig, spVariablesCustom: updated };
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newConfig }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erreur sauvegarde');
      }
      setVars(updated);
      onSaved(newConfig);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async (v: SpVariableCustom) => {
    await persistVars([...vars, v]);
    setShowForm(false);
  };

  const handleEdit = async (v: SpVariableCustom) => {
    const updated = vars.map((existing, i) => (i === editingIdx ? v : existing));
    await persistVars(updated);
    setEditingIdx(null);
  };

  const handleDelete = async (idx: number) => {
    if (!confirm(`Supprimer la variable "${vars[idx].key}" ?`)) return;
    await persistVars(vars.filter((_, i) => i !== idx));
  };

  const existingKeys = vars.map((v) => v.key);

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          Variables custom SP
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-normal">
            {vars.length} variable{vars.length !== 1 ? 's' : ''}
          </span>
          {vars.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-normal">
              {vars.filter((v) => !usedVariables.has(v.key)).length} non utilisée{vars.filter((v) => !usedVariables.has(v.key)).length !== 1 ? 's' : ''}
            </span>
          )}
        </h4>
        <div className="flex gap-2">
          {vars.filter((v) => !usedVariables.has(v.key)).length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Supprimer ${vars.filter((v) => !usedVariables.has(v.key)).length} variable(s) non utilisée(s) ?`)) {
                  const toKeep = vars.filter((v) => usedVariables.has(v.key));
                  persistVars(toKeep);
                }
              }}
              disabled={!!isSaving}
              className="flex items-center gap-1 px-3 py-1.5 border border-red-200 rounded text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Nettoyer
            </button>
          )}
          {!showForm && editingIdx === null && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={!!isSaving}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouvelle variable
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-red-600 mb-3">{saveError}</p>
      )}

      {/* Liste des variables existantes */}
      {vars.length > 0 && (
        <div className="space-y-1 mb-4">
          {vars.map((v, idx) => (
            <div key={v.key}>
              {editingIdx === idx ? (
                <VariableForm
                  initial={v}
                  existingKeys={existingKeys.filter((_, i) => i !== idx)}
                  onSave={handleEdit}
                  onCancel={() => setEditingIdx(null)}
                />
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50">
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                    >
                      {v.type === 'tableau'
                        ? (expandedIdx === idx ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />)
                        : <span className="w-3.5" />
                      }
                      <code className="text-xs font-mono text-blue-700">{`{{${v.key}}}`}</code>
                      <span className="text-xs text-gray-600">{v.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        v.type === 'tableau' ? 'bg-orange-100 text-orange-700' :
                        v.type === 'number' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {v.type === 'tableau' ? `tableau (${v.rowFields?.length ?? 0} champs)` : v.type}
                      </span>
                      {!usedVariables.has(v.key) && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                          Non utilisée
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(
                          v.type === 'tableau'
                            ? `{{#${v.key}}}\n${(v.rowFields ?? []).map(rf => `{{${rf.id}}}`).join('  ')}\n{{/${v.key}}}`
                            : `{{${v.key}}}`
                        )}
                        className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 border rounded"
                      >
                        Copier
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIdx(idx)}
                        className="text-gray-400 hover:text-gray-700 p-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(idx)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sous-champs tableau */}
                  {v.type === 'tableau' && expandedIdx === idx && (v.rowFields ?? []).length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 space-y-1">
                      {(v.rowFields ?? []).map((rf) => (
                        <div key={rf.id} className="flex items-center gap-2">
                          <code className="text-xs font-mono text-blue-600">{`{{${rf.id}}}`}</code>
                          <span className="text-xs text-gray-500">{rf.label}</span>
                          <span className="text-xs text-gray-400">({rf.type})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {vars.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 italic mb-3">
          Aucune variable custom définie. Les variables ci-dessus sont les variables SP standard (non modifiables).
        </p>
      )}

      {/* Formulaire ajout */}
      {showForm && (
        <VariableForm
          initial={EMPTY_VAR as SpVariableCustom}
          existingKeys={existingKeys}
          onSave={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isSaving && <p className="text-xs text-gray-400 mt-2">Sauvegarde en cours...</p>}
    </div>
  );
}
