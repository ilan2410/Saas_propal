'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Package, ShieldCheck, Info, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SpConditionEditor } from './SpConditionEditor';
import type {
  PropositionTemplate,
  CatalogueProduit,
  CatalogueCategorie,
  SpQuestion,
  SpConditionLogique,
  SpPreferencesProduits,
  SpRegleProduitAuto,
  WordConfig,
} from '@/types';
import { supportsSp } from '@/lib/templates/supportsSp';

const CATEGORIE_LABELS: Record<CatalogueCategorie, string> = {
  mobile: 'Mobile',
  internet: 'Internet',
  fixe: 'Fixe',
  cloud: 'Cloud',
  equipement: 'Équipement',
  cadeau: 'Cadeau',
  installation: 'Installation',
  autre: 'Autre',
};

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRegle(): SpRegleProduitAuto {
  return {
    id: generateId(),
    nom: 'Nouvelle règle',
    actif: true,
    produits_ids: [],
    groupes_conditions: [],
    logique_declencheur: 'ET',
  };
}

function defaultConfig(): SpPreferencesProduits {
  return { produits_fixes_ids: [], regles_auto: [] };
}

function getWordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => supportsSp(t.file_type));
}

function getConfig(template: PropositionTemplate | undefined): SpPreferencesProduits {
  if (!template) return defaultConfig();
  const cfg = template.file_config as WordConfig | undefined;
  return cfg?.sp_preferences_produits ?? defaultConfig();
}

function formatPrix(p: CatalogueProduit): string {
  if (p.type_frequence === 'mensuel' && p.prix_mensuel != null) {
    return `${p.prix_mensuel.toFixed(2).replace('.', ',')} €/mois`;
  }
  if (p.type_frequence === 'unique' && p.prix_vente != null) {
    return `${p.prix_vente.toFixed(2).replace('.', ',')} €`;
  }
  return '';
}

function matchSearch(p: CatalogueProduit, q: string): boolean {
  const lq = q.toLowerCase();
  return (
    p.nom.toLowerCase().includes(lq) ||
    (p.fournisseur?.toLowerCase().includes(lq) ?? false) ||
    CATEGORIE_LABELS[p.categorie].toLowerCase().includes(lq)
  );
}

// ── Composant sélecteur produit avec recherche ────────────────────────
interface ProductSearchPickerProps {
  allProducts: CatalogueProduit[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  accentColor?: 'green' | 'blue';
  placeholder?: string;
}

function ProductSearchPicker({
  allProducts,
  selectedIds,
  onToggle,
  accentColor = 'blue',
  placeholder = 'Rechercher un produit…',
}: ProductSearchPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProducts = allProducts.filter((p) => selectedIds.includes(p.id));
  const unselectedFiltered = query.trim().length >= 1
    ? allProducts.filter((p) => !selectedIds.includes(p.id) && matchSearch(p, query))
    : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const chipAccent = accentColor === 'green'
    ? 'bg-green-50 text-green-800 border-green-200'
    : 'bg-blue-50 text-blue-800 border-blue-200';
  const chipXAccent = accentColor === 'green'
    ? 'hover:text-green-900'
    : 'hover:text-blue-900';

  return (
    <div className="space-y-2">
      {/* Chips des produits sélectionnés */}
      {selectedProducts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedProducts.map((p) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${chipAccent}`}
            >
              {p.nom}
              {formatPrix(p) && <span className="opacity-60">· {formatPrix(p)}</span>}
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                className={`ml-0.5 text-current opacity-50 ${chipXAccent} transition-opacity hover:opacity-100`}
                title="Retirer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Barre de recherche + dropdown */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setOpen(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {open && unselectedFiltered.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-md divide-y divide-gray-100 max-h-52 overflow-y-auto">
            {unselectedFiltered.slice(0, 10).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onToggle(p.id);
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800 truncate">{p.nom}</span>
                  <span className="block text-xs text-gray-500">
                    {CATEGORIE_LABELS[p.categorie]}
                    {p.fournisseur && ` · ${p.fournisseur}`}
                    {formatPrix(p) && ` · ${formatPrix(p)}`}
                  </span>
                </span>
              </button>
            ))}
            {unselectedFiltered.length > 10 && (
              <p className="px-3 py-2 text-xs text-gray-400 text-center">
                {unselectedFiltered.length - 10} résultat(s) supplémentaire(s) — affinez la recherche
              </p>
            )}
          </div>
        )}

        {open && query.trim().length >= 1 && unselectedFiltered.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-md px-3 py-3 text-sm text-gray-400">
            Aucun produit correspondant.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────

interface Props {
  templates: PropositionTemplate[];
}

export function SpProduitPreferencesManager({ templates }: Props) {
  const wordTemplates = getWordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wordTemplates[0]?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [allProducts, setAllProducts] = useState<CatalogueProduit[]>([]);
  const [questions, setQuestions] = useState<SpQuestion[]>([]);
  const [config, setConfig] = useState<SpPreferencesProduits>(defaultConfig);
  const [liveFileCfg, setLiveFileCfg] = useState<WordConfig | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/catalogue')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.produits)) {
          setAllProducts((data.produits as CatalogueProduit[]).filter((p) => p.actif));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Re-fetch template file_config from API whenever templateId changes
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/templates/${templateId}`).then((r) => r.json()),
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
    ]).then(([tData, qData]) => {
      if (cancelled) return;
      const fileCfg = (tData?.template?.file_config ?? null) as WordConfig | null;
      setLiveFileCfg(fileCfg);
      setConfig(fileCfg?.sp_preferences_produits ?? defaultConfig());
      if (Array.isArray(qData?.questions)) {
        setQuestions(qData.questions as SpQuestion[]);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [templateId]);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    setExpandedRuleId(null);
  };

  const toggleFixedProduct = (produitId: string) => {
    const current = new Set(config.produits_fixes_ids);
    if (current.has(produitId)) current.delete(produitId);
    else current.add(produitId);
    setConfig((prev) => ({ ...prev, produits_fixes_ids: Array.from(current) }));
  };

  const addRegle = () => {
    const regle = emptyRegle();
    setConfig((prev) => ({ ...prev, regles_auto: [...prev.regles_auto, regle] }));
    setExpandedRuleId(regle.id);
  };

  const removeRegle = (id: string) => {
    setConfig((prev) => ({ ...prev, regles_auto: prev.regles_auto.filter((r) => r.id !== id) }));
    if (expandedRuleId === id) setExpandedRuleId(null);
  };

  const updateRegle = (id: string, patch: Partial<SpRegleProduitAuto>) => {
    setConfig((prev) => ({
      ...prev,
      regles_auto: prev.regles_auto.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const toggleRegleProduit = (regleId: string, produitId: string) => {
    const regle = config.regles_auto.find((r) => r.id === regleId);
    if (!regle) return;
    const current = new Set(regle.produits_ids);
    if (current.has(produitId)) current.delete(produitId);
    else current.add(produitId);
    updateRegle(regleId, { produits_ids: Array.from(current) });
  };

  const handleSave = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      const currentCfg = (liveFileCfg ?? {}) as WordConfig;
      const newFileConfig: WordConfig = { ...currentCfg, sp_preferences_produits: config };
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_config: newFileConfig }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      // Re-fetch to confirm save and keep liveFileCfg in sync
      const refreshed = await fetch(`/api/templates/${templateId}`).then((r) => r.json());
      const updatedCfg = (refreshed?.template?.file_config ?? null) as WordConfig | null;
      setLiveFileCfg(updatedCfg);
      toast.success('Préférences produits enregistrées');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  if (wordTemplates.length === 0) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">Aucun template Word trouvé. Les préférences produits s&apos;appliquent aux templates Word SP.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Sélecteur de template */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Template :</label>
        <select
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
        >
          {wordTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.nom}</option>
          ))}
        </select>
      </div>

      {/* ── Section 1 : Produits fixes ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm text-green-800 space-y-1">
            <p className="font-medium">Produits inclus systématiquement</p>
            <p className="text-green-700">Ces produits sont toujours présents dans le panier SP, quelle que soit la configuration du questionnaire. Ils apparaissent dans le document Word généré.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">Chargement du catalogue…</p>
        ) : (
          <ProductSearchPicker
            allProducts={allProducts}
            selectedIds={config.produits_fixes_ids}
            onToggle={toggleFixedProduct}
            accentColor="green"
            placeholder="Rechercher un produit à inclure systématiquement…"
          />
        )}

        {config.produits_fixes_ids.length > 0 && (
          <p className="text-xs text-green-700 font-medium">
            {config.produits_fixes_ids.length} produit(s) ajouté(s) automatiquement à chaque proposition.
          </p>
        )}
      </div>

      {/* ── Section 2 : Règles conditionnelles ─────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Règles d&apos;ajout conditionnel</h3>
            <p className="text-sm text-gray-500">Produits ajoutés automatiquement au panier selon les réponses du questionnaire.</p>
          </div>
          <Button size="sm" onClick={addRegle}>
            <Plus className="w-4 h-4 mr-1" />
            Ajouter une règle
          </Button>
        </div>

        {config.regles_auto.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            Aucune règle configurée. Ajoutez une règle pour déclencher des produits selon les réponses.
          </div>
        )}

        {config.regles_auto.map((regle) => {
          const isExpanded = expandedRuleId === regle.id;
          const selectedProds = allProducts.filter((p) => regle.produits_ids.includes(p.id));

          return (
            <div key={regle.id} className="rounded-lg border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setExpandedRuleId(isExpanded ? null : regle.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{regle.nom}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${regle.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {regle.actif ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 pl-5">
                    {selectedProds.length > 0
                      ? selectedProds.map((p) => p.nom).join(', ')
                      : 'Aucun produit sélectionné'}
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{isExpanded ? 'Réduire' : 'Configurer'}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nom de la règle</label>
                      <input
                        value={regle.nom}
                        onChange={(e) => updateRegle(regle.id, { nom: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                      <input
                        type="checkbox"
                        checked={regle.actif}
                        onChange={(e) => updateRegle(regle.id, { actif: e.target.checked })}
                      />
                      Règle active
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Produits à ajouter si les conditions sont vraies</p>
                    <ProductSearchPicker
                      allProducts={allProducts}
                      selectedIds={regle.produits_ids}
                      onToggle={(id) => toggleRegleProduit(regle.id, id)}
                      accentColor="blue"
                      placeholder="Rechercher un produit à ajouter…"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Conditions d&apos;application</p>
                    <SpConditionEditor
                      groupes={regle.groupes_conditions}
                      logiqueRacine={regle.logique_declencheur}
                      onChange={(groupes, logique: SpConditionLogique) =>
                        updateRegle(regle.id, { groupes_conditions: groupes, logique_declencheur: logique })
                      }
                      otherQuestions={questions}
                      catalogueProduits={allProducts}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => removeRegle(regle.id)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Supprimer la règle
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Sauvegarde ─────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button onClick={handleSave} disabled={isSaving || !templateId}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
