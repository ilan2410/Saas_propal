'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpCodePromo } from '@/types';

interface Props {
  codes: SpCodePromo[];
  onChange: (codes: SpCodePromo[]) => void;
  mode: 'addition' | 'soustraction';
  onModeChange: (mode: 'addition' | 'soustraction') => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function SpCodesPromoManager({ codes, onChange, mode, onModeChange }: Props) {
  // Edition d'un code existant
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editValeur, setEditValeur] = useState('');

  // Nouveau code (formulaire temporaire, pas encore dans le tableau)
  const [showNewForm, setShowNewForm] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newValeur, setNewValeur] = useState('');

  const startEdit = (code: SpCodePromo) => {
    setEditingId(code.id);
    setEditNom(code.nom);
    setEditValeur(String(code.valeur));
  };

  const confirmEdit = (id: string) => {
    const valeur = parseFloat(editValeur.replace(',', '.'));
    if (!editNom.trim() || isNaN(valeur) || valeur < 0) return;
    onChange(codes.map((c) => c.id === id ? { ...c, nom: editNom.trim().toUpperCase(), valeur } : c));
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const openNewForm = () => {
    setShowNewForm(true);
    setNewNom('');
    setNewValeur('');
  };

  const confirmNew = () => {
    const valeur = parseFloat(newValeur.replace(',', '.'));
    if (!newNom.trim() || isNaN(valeur) || valeur < 0) return;
    onChange([...codes, { id: generateId(), nom: newNom.trim().toUpperCase(), valeur }]);
    setShowNewForm(false);
    setNewNom('');
    setNewValeur('');
  };

  const cancelNew = () => {
    setShowNewForm(false);
    setNewNom('');
    setNewValeur('');
  };

  const removeCode = (id: string) => {
    onChange(codes.filter((c) => c.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 p-3 rounded-lg border border-gray-200 bg-gray-50">
        <span className="text-sm font-medium text-gray-700 shrink-0">Effet du code sur le loyer :</span>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="radio"
            name="codes-promo-mode"
            checked={mode === 'addition'}
            onChange={() => onModeChange('addition')}
            className="accent-blue-600"
          />
          Additionner à la marge
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="radio"
            name="codes-promo-mode"
            checked={mode === 'soustraction'}
            onChange={() => onModeChange('soustraction')}
            className="accent-blue-600"
          />
          Soustraire de la marge
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Codes promo SP</h3>
          <p className="text-sm text-gray-500">
            Chaque code est associé à un montant en € utilisé comme marge dans le calcul du loyer.
          </p>
        </div>
        <Button size="sm" onClick={openNewForm} disabled={showNewForm}>
          <Plus className="w-4 h-4 mr-1" />
          Ajouter un code
        </Button>
      </div>

      {/* Formulaire nouveau code */}
      {showNewForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-700 mb-3">Nouveau code promo</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Nom du code</label>
              <input
                value={newNom}
                onChange={(e) => setNewNom(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                placeholder="Ex: CODE10"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') cancelNew(); }}
              />
            </div>
            <div className="w-40">
              <label className="block text-xs text-gray-600 mb-1">Valeur (€)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newValeur}
                  onChange={(e) => setNewValeur(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  placeholder="500"
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') cancelNew(); }}
                />
                <span className="text-xs text-gray-400 shrink-0">€</span>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-5">
              <button
                type="button"
                onClick={confirmNew}
                className="p-1.5 rounded text-green-600 hover:bg-green-100"
                title="Confirmer"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={cancelNew}
                className="p-1.5 rounded text-gray-400 hover:bg-gray-200"
                title="Annuler"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {codes.length === 0 && !showNewForm && (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Aucun code promo configuré. Cliquez sur &quot;Ajouter un code&quot; pour créer votre premier code.
        </div>
      )}

      {codes.length > 0 && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          <div className="grid grid-cols-[1fr_140px_80px] gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Code</span>
            <span>Valeur (€)</span>
            <span />
          </div>

          {codes.map((code) => (
            <div key={code.id} className="grid grid-cols-[1fr_140px_80px] gap-2 items-center px-4 py-3">
              {editingId === code.id ? (
                <>
                  <input
                    value={editNom}
                    onChange={(e) => setEditNom(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                    placeholder="Ex: CODE10"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(code.id); if (e.key === 'Escape') cancelEdit(); }}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editValeur}
                      onChange={(e) => setEditValeur(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="500"
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(code.id); if (e.key === 'Escape') cancelEdit(); }}
                    />
                    <span className="text-xs text-gray-400 shrink-0">€</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => confirmEdit(code.id)}
                      className="p-1 rounded text-green-600 hover:bg-green-50"
                      title="Confirmer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100"
                      title="Annuler"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-mono font-medium text-gray-900">{code.nom}</span>
                  <span className="text-sm text-gray-700">
                    {code.valeur.toLocaleString('fr-FR')} €
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(code)}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCode(code.id)}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
