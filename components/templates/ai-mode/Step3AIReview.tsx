'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AIAnalysis } from './types';

interface Props {
  analysis: AIAnalysis;
  setAnalysis: (a: AIAnalysis) => void;
  fileUrl: string;
  templateName: string;
  tempId: string;
  onPrev: () => void;
  onApplied: (payload: {
    fileUrl: string;
    fileConfig: Record<string, unknown>;
    champsActifs: string[];
    aiAnalysis: AIAnalysis;
  }) => void | Promise<void>;
}

export function Step3AIReview({
  analysis,
  setAnalysis,
  fileUrl,
  templateName,
  tempId,
  onPrev,
  onApplied,
}: Props) {
  const [saving, setSaving] = useState(false);

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof analysis.simpleVariables>();
    for (const v of analysis.simpleVariables) {
      const arr = map.get(v.category) || [];
      arr.push(v);
      map.set(v.category, arr);
    }
    return Array.from(map.entries());
  }, [analysis.simpleVariables]);

  const updateVarKey = (id: string, newKey: string) => {
    setAnalysis({
      ...analysis,
      simpleVariables: analysis.simpleVariables.map((v) =>
        v.id === id ? { ...v, suggestedDataKey: newKey } : v
      ),
    });
  };

  const updateColKey = (tableId: string, colId: string, newKey: string) => {
    setAnalysis({
      ...analysis,
      tables: analysis.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              columns: t.columns.map((c) =>
                c.id === colId ? { ...c, suggestedDataKey: newKey } : c
              ),
            }
          : t
      ),
    });
  };

  const handleApply = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/templates/ai/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl,
          analysis,
          templateName,
          tempId,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Erreur apply');
      }
      const data = await resp.json();
      await onApplied({
        fileUrl: data.fileUrl,
        fileConfig: data.fileConfig,
        champsActifs: data.champsActifs,
        aiAnalysis: data.aiAnalysis,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Vérification finale</h2>
        <p className="text-sm text-gray-600">
          Type détecté :{' '}
          <span className="font-semibold">{analysis.documentType}</span> —{' '}
          {analysis.simpleVariables.length} variables, {analysis.tables.length} tableaux
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="font-semibold">Variables simples</h3>
        {byCategory.length === 0 && (
          <p className="text-sm text-gray-500">Aucune variable détectée.</p>
        )}
        {byCategory.map(([cat, vars]) => (
          <div key={cat} className="border rounded-lg">
            <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold uppercase tracking-wide">
              {cat}
            </div>
            <div className="divide-y">
              {vars.map((v) => (
                <div key={v.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-sm">
                  <code className="col-span-3 text-xs bg-yellow-50 px-2 py-1 rounded">
                    {`{{${v.id}}}`}
                  </code>
                  <div className="col-span-3 text-gray-700 truncate">{v.label}</div>
                  <input
                    className="col-span-5 border rounded px-2 py-1 text-xs font-mono"
                    value={v.suggestedDataKey}
                    onChange={(e) => updateVarKey(v.id, e.target.value)}
                  />
                  <span className={`col-span-1 text-xs ${v.isCustom ? 'text-purple-600' : 'text-green-600'}`}>
                    {v.isCustom ? 'custom' : 'catalogue'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold">Tableaux</h3>
        {analysis.tables.length === 0 && (
          <p className="text-sm text-gray-500">Aucun tableau détecté.</p>
        )}
        {analysis.tables.map((t) => (
          <div key={t.id} className="border rounded-lg">
            <div className="px-3 py-2 bg-purple-50 border-b text-sm font-semibold">
              {t.label} <span className="text-xs text-gray-500">({t.id})</span>
            </div>
            <div className="divide-y">
              {t.columns.map((c) => (
                <div key={c.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-sm">
                  <code className="col-span-3 text-xs bg-purple-50 px-2 py-1 rounded">
                    {`{{${t.id}.${c.id}}}`}
                  </code>
                  <div className="col-span-3 text-gray-700 truncate">{c.header}</div>
                  <input
                    className="col-span-6 border rounded px-2 py-1 text-xs font-mono"
                    value={c.suggestedDataKey}
                    onChange={(e) => updateColKey(t.id, c.id, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex justify-between items-center pt-4 border-t">
        <button
          onClick={onPrev}
          className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
        >
          ← Précédent
        </button>
        <button
          onClick={handleApply}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Sauvegarder le template
        </button>
      </div>
    </div>
  );
}
