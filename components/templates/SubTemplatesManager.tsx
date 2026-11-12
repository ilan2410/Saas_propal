'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Step2UploadTemplate } from './Step2UploadTemplate';
import type { TemplateData, ExcelState } from './TemplateWizard';
import { documentConfig, subTemplateConfig, type SubTemplate, type SubTemplateMode } from '@/lib/templates/sub-templates';

export function SubTemplatesManager({ templateId, organizationId, canManage = false }: { templateId: string; organizationId?: string; canManage?: boolean }) {
 const [children, setChildren] = useState<SubTemplate[]>([]);
 const [parent, setParent] = useState<TemplateData>();
 const [mode, setMode] = useState<SubTemplateMode>('all');
 const [draft, setDraft] = useState<Partial<TemplateData> | null>(null);
 const [childId, setChildId] = useState<string>('new');
 const [excel, setExcel] = useState<ExcelState>({ file: null, fileName: null, sheets: [], mappings: [], arrayMappings: [] });
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const [enabled, setEnabled] = useState(false);
 const draftRef = useRef(draft);
 const url = '/api/templates/' + templateId + '/sub-templates' + (organizationId ? '?organizationId=' + encodeURIComponent(organizationId) : '');
 const load = useCallback(async () => {
  const res = await fetch(url); const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  setEnabled(data.enabled); setChildren(data.sub_templates); setParent(data.parent); setMode(data.mode);
 }, [url]);
 useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
 function update(patch: Partial<TemplateData>) {
  const current = draftRef.current;
  const next = { ...current, ...patch, file_config: patch.file_config ? subTemplateConfig(parent?.file_config, patch.file_config) : current?.file_config };
  draftRef.current = next; setDraft(next);
 }
 async function edit(child?: SubTemplate) {
  setError(''); setChildId(child?.id ?? 'new');
  const next = { ...parent, id: templateId, nom: child?.nom ?? '', file_type: child?.file_type ?? 'word', file_url: child?.file_url ?? '', file_name: child?.file_name ?? '', file_size_mb: child?.file_size_mb ?? 0, file_config: subTemplateConfig(parent?.file_config, child?.file_config) };
  draftRef.current = next; setDraft(next);
  setExcel({ file: null, fileName: child?.file_name ?? null, sheets: [], mappings: (child?.file_config.sheetMappings ?? []) as ExcelState['mappings'], arrayMappings: (child?.file_config.arrayMappings ?? []) as ExcelState['arrayMappings'] });
  if (child?.file_type === 'excel') {
   try {
    const res = await fetch('/api/templates/parse-excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileUrl: child.file_url }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    if (draftRef.current?.file_url === child.file_url) setExcel(prev => ({ ...prev, sheets: data.sheets ?? [] }));
   } catch(e) { setError(e instanceof Error ? e.message : 'Chargement Excel impossible'); }
  }
 }
 async function save(patch?: Partial<TemplateData>) {
  if (!canManage) return;
  const value = { ...draftRef.current, ...patch };
  if (!value.nom?.trim()) { setError('Donnez un nom au sous-template.'); return; }
  if (!value.file_url) { setError('Choisissez et configurez un fichier Word ou Excel.'); return; }
  setBusy(true); setError('');
  try {
   const res = await fetch(url, { method: childId === 'new' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...value, id: childId, file_config: documentConfig(value.file_config) }) });
   const data = await res.json(); if (!res.ok) throw new Error(data.error);
   setDraft(null); draftRef.current = null; await load();
  } catch(e) { setError(e instanceof Error ? e.message : 'Sauvegarde impossible'); } finally { setBusy(false); }
 }
 async function remove(child: SubTemplate) {
  if (!confirm('Supprimer le sous-template « ' + child.nom + ' » ?')) return;
  setBusy(true); setError('');
  try {
   const res = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: child.id }) });
   const data = await res.json(); if (!res.ok) throw new Error(data.error); await load();
  } catch(e) { setError(e instanceof Error ? e.message : 'Suppression impossible'); } finally { setBusy(false); }
 }
 async function changeMode(value: SubTemplateMode) {
  setError('');
  try { const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: value }) }); if (!res.ok) throw new Error('Réglage non enregistré'); setMode(value); } catch(e) { setError((e as Error).message); }
 }
 async function toggleEnabled() {
  setBusy(true); setError('');
  try {
   const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) });
   const data = await res.json(); if (!res.ok) throw new Error(data.error);
   setEnabled(data.enabled); setDraft(null); draftRef.current = null;
  } catch(e) { setError(e instanceof Error ? e.message : 'Activation impossible'); } finally { setBusy(false); }
 }
 return <div className="space-y-4">
  <div className="flex items-center justify-between gap-4 py-3">
   <div><h2 id={'sub-templates-label-' + templateId} className="text-lg font-semibold text-gray-900">Activer les sous-templates</h2><p className="mt-1 text-sm text-gray-500">Joindre des documents annexes à ce template.</p></div>
   <button type="button" role="switch" aria-checked={enabled} aria-labelledby={'sub-templates-label-' + templateId} disabled={busy || !parent || !canManage} onClick={toggleEnabled} className={'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50 ' + (enabled ? 'bg-slate-900' : 'bg-gray-300')}><span className={'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ' + (enabled ? 'translate-x-5' : 'translate-x-0.5')} /></button>
  </div>
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  {enabled && <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
  <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Sous-templates</h2>{canManage && <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => edit()}>Ajouter un sous-template</button>}</div>
  <p className="text-sm text-gray-600">Documents annexes remplis avec les variables de ce template.</p>
  {!organizationId && <label className="block text-sm">Mon réglage pour ce template <select className="ml-3 rounded border p-2" value={mode} onChange={e => changeMode(e.target.value as SubTemplateMode)}><option value="all">Tout générer</option><option value="choose">Me laisser choisir</option></select></label>}
  {!children.length && !error && <p className="text-sm text-gray-500">Aucun sous-template associé.</p>}
  <ul className="divide-y">{children.map(child => <li key={child.id} className="flex items-center justify-between gap-3 py-3"><span>{child.nom} <span className="text-xs uppercase text-gray-500">{child.file_type}</span></span>{canManage && <span className="flex gap-3"><button className="text-sm text-blue-700" disabled={busy} onClick={() => edit(child)}>Mapping et aperçu</button><button className="text-sm text-red-700" disabled={busy} onClick={() => remove(child)}>Supprimer</button></span>}</li>)}</ul>
  {draft && parent && <div className="border-t pt-5 space-y-4">
   <label className="block text-sm font-medium">Nom du sous-template<input maxLength={120} className="mt-1 block w-full rounded border p-2" value={draft.nom ?? ''} onChange={e => update({ nom: e.target.value })} /></label>
   <p className="text-sm text-gray-500">Les champs, variables et paramètres métier sont hérités du template parent.</p>
   <Step2UploadTemplate key={childId} organizationId={organizationId} subTemplateId={childId} templateData={draft} updateTemplateData={update} excelState={excel} updateExcelState={patch => setExcel(prev => ({ ...prev, ...patch }))} secteur={parent.secteur ?? 'telephonie'} onNext={() => save()} onPrev={() => setDraft(null)} onSave={() => save()} onExcelSave={patch => save(patch)} isLoading={busy} />
   <button className="rounded border px-4 py-2 text-sm" onClick={() => setDraft(null)}>Fermer</button>
  </div>}
 </section>}
 </div>;
}
