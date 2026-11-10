'use client';
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { SubTemplateMode, SubTemplateGenerationResult } from '@/lib/templates/sub-templates';
export interface GenerationDocuments {
 template_id: string; mode: SubTemplateMode; selected_sub_template_ids: string[];
 sub_templates: { id: string; nom: string; file_type: string; result?: { status: string; error?: string } }[];
}
export interface GenerationResult { file_url: string | null; sub_templates: SubTemplateGenerationResult[] }
export async function loadGenerationDocuments(id: string): Promise<GenerationDocuments> {
 const res = await fetch('/api/propositions/' + id + '/generate'); const data = await res.json();
 if (!res.ok) throw new Error(data.error); return data;
}
export function usePropositionGeneration() {
 const [choice, setChoice] = useState<GenerationDocuments | null>(null);
 const [selected, setSelected] = useState<string[]>([]);
 const [mode, setMode] = useState<SubTemplateMode>('all');
 const resolve = useRef<((value: { selected: string[]; mode: SubTemplateMode } | null) => void) | null>(null);
 function finish(value: { selected: string[]; mode: SubTemplateMode } | null) { resolve.current?.(value); resolve.current = null; setChoice(null); }
 async function generate(id: string, options: { target?: string; propositionOnly?: boolean; configure?: boolean } = {}): Promise<GenerationResult> {
  const docs = await loadGenerationDocuments(id);
  let selection: string[] | undefined;
  if (docs.sub_templates.length && !options.target && !options.propositionOnly && (docs.mode === 'choose' || options.configure)) {
   setChoice(docs); setSelected(docs.selected_sub_template_ids); setMode(docs.mode);
   const value = await new Promise<{ selected: string[]; mode: SubTemplateMode } | null>(r => { resolve.current = r; });
   if (!value) throw new Error('Génération annulée');
   const pref = await fetch('/api/templates/' + docs.template_id + '/sub-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: value.mode }) });
   if (!pref.ok) throw new Error('Impossible de sauvegarder votre préférence');
   selection = value.mode === 'all' ? docs.sub_templates.map(c => c.id) : value.selected;
  }
  const res = await fetch('/api/propositions/' + id + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected_sub_template_ids: selection, target_sub_template_id: options.target, proposition_only: options.propositionOnly }) });
  const data = await res.json(); if (!res.ok) throw new Error(data.details || data.error || 'Erreur de génération'); return data;
 }
 const selectionDialog = <Dialog open={!!choice} onOpenChange={open => { if (!open) finish(null); }}><DialogContent><DialogHeader><DialogTitle>Documents annexes</DialogTitle><DialogDescription>Choisissez les sous-templates à générer avec cette proposition.</DialogDescription></DialogHeader>
  <label className="text-sm">Mon réglage pour ce template<select className="mt-2 block w-full rounded border p-2" value={mode} onChange={e => setMode(e.target.value as SubTemplateMode)}><option value="all">Tout générer</option><option value="choose">Me laisser choisir</option></select></label>
  <div className="max-h-72 overflow-auto space-y-3">{choice?.sub_templates.map(child => <label key={child.id} className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={mode === 'all'} checked={mode === 'all' || selected.includes(child.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, child.id] : prev.filter(id => id !== child.id))} />{child.nom}</label>)}</div>
  <div className="flex justify-end gap-3"><button onClick={() => finish(null)} className="rounded border px-3 py-2">Annuler</button><button onClick={() => finish({ selected, mode })} className="rounded bg-slate-900 px-3 py-2 text-white">Générer les documents</button></div>
 </DialogContent></Dialog>;
 return { generate, selectionDialog };
}
