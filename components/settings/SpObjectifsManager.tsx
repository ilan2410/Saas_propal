'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SpConditionEditor } from './SpConditionEditor';
import type {
  PropositionTemplate,
  SpObjectifConfig,
  SpObjectifMessage,
  SpGroupeConditions,
  SpConditionLogique,
  SpQuestion,
  CatalogueProduit,
} from '@/types';

interface Props {
  templates: PropositionTemplate[];
}

const ICONES_DISPONIBLES = [
  { value: 'Zap',         label: '⚡ Zap — Vitesse / Débit' },
  { value: 'Wifi',        label: '📶 Wifi — Réseau' },
  { value: 'Phone',       label: '📞 Phone — Téléphonie' },
  { value: 'TrendingDown',label: '📉 TrendingDown — Économies' },
  { value: 'Shield',      label: '🛡 Shield — Sécurité' },
  { value: 'Headphones',  label: '🎧 Headphones — Support' },
  { value: 'Globe',       label: '🌐 Globe — Connectivité' },
  { value: 'Rocket',      label: '🚀 Rocket — Performance' },
  { value: 'Star',        label: '⭐ Star — Générique' },
  { value: 'Sparkles',    label: '✨ Sparkles — Innovation' },
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function wordTemplates(templates: PropositionTemplate[]) {
  return templates.filter((t) => t.file_type === 'word');
}

function emptyMessage(): SpObjectifMessage {
  return {
    id: generateId(),
    ordre: 1,
    label: 'Nouveau message',
    texte: '',
    groupes_conditions: [],
    logique_conditions: 'ET',
  };
}

function emptyObjectif(templateId: string, ordre: number): SpObjectifConfig {
  return {
    id: generateId(),
    template_id: templateId,
    ordre,
    actif: true,
    titre: 'Nouvel objectif',
    question_id: '',
    messages: [emptyMessage()],
  };
}

export function SpObjectifsManager({ templates }: Props) {
  const wTemplates = wordTemplates(templates);
  const [templateId, setTemplateId] = useState<string>(wTemplates[0]?.id ?? '');
  const [objectifs, setObjectifs] = useState<SpObjectifConfig[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const [spQuestions, setSpQuestions] = useState<SpQuestion[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueProduit[]>([]);

  // Load preferences + questions on mount / template change
  useEffect(() => {
    if (!templateId) return;
    setIsLoading(true);
    Promise.all([
      fetch('/api/settings/preferences').then((r) => r.json()),
      fetch(`/api/templates/${templateId}/sp-questions`).then((r) => r.json()),
      fetch('/api/catalogue').then((r) => r.json()),
    ]).then(([prefData, qData, catData]) => {
      const allObjectifs: SpObjectifConfig[] = prefData.preferences?.sp_objectifs_config ?? [];
      setObjectifs(allObjectifs.filter((o) => o.template_id === templateId).sort((a, b) => a.ordre - b.ordre));
      const qs: SpQuestion[] = ((qData.questions ?? []) as SpQuestion[])
        .filter((q) => q.actif)
        .sort((a, b) => a.ordre - b.ordre);
      setSpQuestions(qs);
      setCatalogue(catData.produits ?? []);
    }).catch(() => toast.error('Erreur lors du chargement'))
      .finally(() => setIsLoading(false));
  }, [templateId]);

  const updateObjectif = (id: string, patch: Partial<SpObjectifConfig>) => {
    setObjectifs((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const addObjectif = () => {
    const maxOrdre = objectifs.reduce((m, o) => Math.max(m, o.ordre), 0);
    const obj = emptyObjectif(templateId, maxOrdre + 1);
    setObjectifs((prev) => [...prev, obj]);
    setExpandedId(obj.id);
  };

  const removeObjectif = (id: string) => {
    setObjectifs((prev) => prev.filter((o) => o.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const moveObjectif = (id: string, direction: 'up' | 'down') => {
    const idx = objectifs.findIndex((o) => o.id === id);
    if (idx < 0) return;
    const next = [...objectifs];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const reordered = next.map((o, i) => ({ ...o, ordre: i + 1 }));
    setObjectifs(reordered);
  };

  const addMessage = (objectifId: string) => {
    const obj = objectifs.find((o) => o.id === objectifId);
    if (!obj) return;
    const maxOrdre = obj.messages.reduce((m, msg) => Math.max(m, msg.ordre), 0);
    const msg = { ...emptyMessage(), ordre: maxOrdre + 1 };
    updateObjectif(objectifId, { messages: [...obj.messages, msg] });
    setExpandedMsgId(msg.id);
  };

  const updateMessage = (objectifId: string, msgId: string, patch: Partial<SpObjectifMessage>) => {
    const obj = objectifs.find((o) => o.id === objectifId);
    if (!obj) return;
    updateObjectif(objectifId, {
      messages: obj.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
    });
  };

  const removeMessage = (objectifId: string, msgId: string) => {
    const obj = objectifs.find((o) => o.id === objectifId);
    if (!obj) return;
    updateObjectif(objectifId, { messages: obj.messages.filter((m) => m.id !== msgId) });
    if (expandedMsgId === msgId) setExpandedMsgId(null);
  };

  const moveMessage = (objectifId: string, msgId: string, direction: 'up' | 'down') => {
    const obj = objectifs.find((o) => o.id === objectifId);
    if (!obj) return;
    const idx = obj.messages.findIndex((m) => m.id === msgId);
    const next = [...obj.messages];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    updateObjectif(objectifId, { messages: next.map((m, i) => ({ ...m, ordre: i + 1 })) });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const prefRes = await fetch('/api/settings/preferences').then((r) => r.json());
      const allObjectifs: SpObjectifConfig[] = prefRes.preferences?.sp_objectifs_config ?? [];
      const othersTemplates = allObjectifs.filter((o) => o.template_id !== templateId);
      const merged = [...othersTemplates, ...objectifs];

      const res = await fetch('/api/settings/update-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sp_objectifs_config: merged }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Objectifs enregistrés');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };


  if (wTemplates.length === 0) {
    return (
      <p className="text-sm text-gray-500">Aucun template Word disponible. Créez d'abord un template Word.</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Template :</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
        >
          {wTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.nom}</option>
          ))}
        </select>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Configurez les objectifs affichés dans la section &quot;Objectifs Accomplis&quot; à la fin de la proposition.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={addObjectif}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter un objectif
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}

      {!isLoading && objectifs.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center">
          <p className="text-sm text-gray-500">Aucun objectif configuré pour ce template.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={addObjectif}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter un objectif
          </Button>
        </div>
      )}

      {/* Objectifs list */}
      <div className="space-y-3">
        {objectifs.map((obj, idx) => {
          const isExpanded = expandedId === obj.id;
          return (
            <div key={obj.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 flex-shrink-0">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  className="flex-1 text-left text-sm font-medium text-gray-900 truncate"
                  onClick={() => setExpandedId(isExpanded ? null : obj.id)}
                >
                  {obj.titre || 'Objectif sans titre'}
                </button>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); moveObjectif(obj.id, 'up'); }}
                    disabled={idx === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); moveObjectif(obj.id, 'down'); }}
                    disabled={idx === objectifs.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateObjectif(obj.id, { actif: !obj.actif })}
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${
                      obj.actif
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {obj.actif ? 'Actif' : 'Inactif'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeObjectif(obj.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : obj.id)}
                    className="p-1 text-gray-400"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="p-5 space-y-5 border-t border-gray-100">
                  {/* Basic fields */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Titre affiché</label>
                      <input
                        value={obj.titre}
                        onChange={(e) => updateObjectif(obj.id, { titre: e.target.value })}
                        placeholder="Ex: Améliorer le débit internet"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Icône</label>
                      <select
                        value={obj.icone ?? ''}
                        onChange={(e) => updateObjectif(obj.id, { icone: e.target.value || undefined })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      >
                        <option value="">— Aucune —</option>
                        {ICONES_DISPONIBLES.map((ic) => (
                          <option key={ic.value} value={ic.value}>{ic.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Question déclencheur</label>
                      <select
                        value={obj.question_id}
                        onChange={(e) => updateObjectif(obj.id, { question_id: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      >
                        <option value="">— Sélectionner une question —</option>
                        {spQuestions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.libelle.length > 60 ? q.libelle.slice(0, 60) + '…' : q.libelle}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700">
                        Messages conditionnels
                        <span className="ml-1 font-normal text-gray-400">(tous les messages dont les conditions sont réunies s&apos;affichent)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => addMessage(obj.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ajouter un message
                      </button>
                    </div>

                    {obj.messages.length === 0 && (
                      <p className="text-xs text-gray-400 italic">Aucun message configuré.</p>
                    )}

                    <div className="space-y-2">
                      {[...obj.messages].sort((a, b) => a.ordre - b.ordre).map((msg, mIdx) => {
                        const isMsgExpanded = expandedMsgId === msg.id;
                        return (
                          <div key={msg.id} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 flex-shrink-0">
                                {mIdx + 1}
                              </span>
                              <button
                                type="button"
                                className="flex-1 text-left text-xs font-medium text-gray-700 truncate"
                                onClick={() => setExpandedMsgId(isMsgExpanded ? null : msg.id)}
                              >
                                {msg.label || `Message ${mIdx + 1}`}
                                {msg.groupes_conditions.length === 0 && (
                                  <span className="ml-2 text-gray-400 font-normal">(toujours affiché)</span>
                                )}
                              </button>
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => moveMessage(obj.id, msg.id, 'up')}
                                  disabled={mIdx === 0}
                                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveMessage(obj.id, msg.id, 'down')}
                                  disabled={mIdx === obj.messages.length - 1}
                                  className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeMessage(obj.id, msg.id)}
                                  className="p-0.5 text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedMsgId(isMsgExpanded ? null : msg.id)}
                                  className="p-0.5 text-gray-400"
                                >
                                  {isMsgExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {isMsgExpanded && (
                              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 bg-white">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-600">Nom interne</label>
                                    <input
                                      value={msg.label}
                                      onChange={(e) => updateMessage(obj.id, msg.id, { label: e.target.value })}
                                      placeholder="Ex: FTTH, Économie >15%, Fallback"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-600">
                                    Texte du message
                                  </label>
                                  <p className="text-xs text-gray-400">
                                    Variables disponibles : <code className="bg-gray-100 px-1 rounded">{'{{suggestions.sp_economie_mensuelle}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{reponse.<id_question>}}'}</code>
                                  </p>
                                  <textarea
                                    value={msg.texte}
                                    onChange={(e) => updateMessage(obj.id, msg.id, { texte: e.target.value })}
                                    rows={3}
                                    placeholder="Ex: Bonne nouvelle, vous bénéficiez d'une Fibre FTTH avec un débit théorique à 1Gbps..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono resize-none"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-600">
                                    Conditions d&apos;affichage de ce message
                                    <span className="ml-1 font-normal text-gray-400">(vide = toujours affiché)</span>
                                  </label>
                                  <SpConditionEditor
                                    groupes={msg.groupes_conditions}
                                    logiqueRacine={msg.logique_conditions}
                                    onChange={(groupes: SpGroupeConditions[], logique: SpConditionLogique) =>
                                      updateMessage(obj.id, msg.id, {
                                        groupes_conditions: groupes,
                                        logique_conditions: logique,
                                      })
                                    }
                                    otherQuestions={spQuestions}
                                    catalogueProduits={catalogue}
                                    enableSuggestionsSource
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {objectifs.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer les objectifs'}
          </Button>
        </div>
      )}
    </div>
  );
}
