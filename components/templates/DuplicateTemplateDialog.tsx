'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supportsSp } from '@/lib/templates/supportsSp';

interface OptionDef {
  key: string;
  label: string;
  hint?: string;
}

const CONTENT_OPTIONS: OptionDef[] = [
  { key: 'fichier', label: 'Fichier du template', hint: 'Copie le fichier Excel/Word dans le stockage' },
  { key: 'description', label: 'Description' },
  { key: 'champs', label: 'Champs à extraire' },
  { key: 'mapping', label: 'Mapping du fichier', hint: 'Zones, cellules et tableaux mappés' },
  { key: 'prompt', label: 'Prompt IA & modèle', hint: 'Prompt d\'extraction et modèle Claude' },
  { key: 'merge', label: 'Fusion de catégories' },
];

const SP_OPTIONS_LIST: OptionDef[] = [
  { key: 'questions', label: 'Questions SP', hint: 'Questionnaire de la situation proposée' },
  { key: 'objectifs', label: 'Objectifs SP', hint: 'Nécessite « Questions SP »' },
  { key: 'variables', label: 'Variables SP', hint: 'Variables actives et personnalisées' },
  { key: 'clauses', label: 'Clauses conditionnelles' },
  { key: 'loyer', label: 'Loyer & résiliation' },
  { key: 'remises', label: 'Remises' },
  { key: 'codes_promo', label: 'Codes promo' },
  { key: 'produits', label: 'Produits & tableaux', hint: 'Préférences produits, tableaux fusionnés, ordre' },
  { key: 'mode_client', label: 'Mode client' },
  { key: 'reference', label: 'Référence proposition', hint: 'Format de la référence générée' },
];

const ALL_KEYS = [...CONTENT_OPTIONS, ...SP_OPTIONS_LIST].map((o) => o.key);

interface Props {
  templateId: string;
  templateName: string;
  fileType: string;
  variant?: 'button' | 'icon';
}

export function DuplicateTemplateDialog({ templateId, templateName, fileType, variant = 'button' }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(ALL_KEYS));
  const [isDuplicating, setIsDuplicating] = useState(false);

  const spAvailable = supportsSp(fileType);

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Les objectifs référencent les questions : sans elles, inutiles.
      if (key === 'questions' && !next.has('questions')) next.delete('objectifs');
      return next;
    });
  };

  const setAll = (value: boolean) => {
    setChecked(value ? new Set(ALL_KEYS) : new Set());
  };

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const options = ALL_KEYS.filter(
        (key) => checked.has(key) && (spAvailable || !SP_OPTIONS_LIST.some((o) => o.key === key)),
      );
      const response = await fetch(`/api/templates/${templateId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Erreur lors de la duplication');
      }

      setOpen(false);
      router.push(`/templates/${data.template.id}`);
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la duplication');
    } finally {
      setIsDuplicating(false);
    }
  };

  const renderOption = (option: OptionDef) => {
    const disabled = option.key === 'objectifs' && !checked.has('questions');
    return (
      <label
        key={option.key}
        className={`flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={checked.has(option.key)}
          disabled={disabled}
          onChange={() => toggle(option.key)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">
          {option.label}
          {option.hint && <span className="block text-xs text-gray-400">{option.hint}</span>}
        </span>
      </label>
    );
  };

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          title="Dupliquer le template"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Dupliquer
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dupliquer le template</DialogTitle>
            <DialogDescription>
              Une copie de « {templateName} » sera créée en brouillon, avec tous ses réglages.
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 w-fit"
          >
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Options avancées
          </button>

          {showAdvanced && (
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Éléments à copier
                </p>
                <button
                  type="button"
                  onClick={() => setAll(checked.size < ALL_KEYS.length)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {checked.size < ALL_KEYS.length ? 'Tout sélectionner' : 'Tout désélectionner'}
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Contenu</p>
                <div className="space-y-0.5">{CONTENT_OPTIONS.map(renderOption)}</div>
              </div>

              {spAvailable && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Situation Proposée (SP)</p>
                  <div className="space-y-0.5">{SP_OPTIONS_LIST.map(renderOption)}</div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isDuplicating}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={isDuplicating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
            >
              {isDuplicating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Dupliquer
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
