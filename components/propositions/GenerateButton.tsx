'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Loader2, ChevronDown } from 'lucide-react';
import { usePropositionGeneration, loadGenerationDocuments, type GenerationDocuments, type GenerationResult } from './usePropositionGeneration';
interface GenerateButtonProps {
 propositionId: string; variant?: 'primary' | 'secondary' | 'small'; className?: string;
 label?: string; icon?: ReactNode; onGenerated?: (result: GenerationResult) => void; download?: boolean;
}
export function GenerateButton({ propositionId, variant = 'primary', className = '', label, icon, onGenerated, download = true }: GenerateButtonProps) {
 const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
 const [menu, setMenu] = useState(false), [docs, setDocs] = useState<GenerationDocuments | null>(null);
 const { generate, selectionDialog } = usePropositionGeneration(); const router = useRouter();
 useEffect(() => { let active = true; loadGenerationDocuments(propositionId).then(d => { if (active) setDocs(d); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [propositionId]);
 async function run(target?: string, propositionOnly = false, configure = false) {
  setBusy(true); setError(null); setMenu(false);
  try {
   const result = await generate(propositionId, { target, propositionOnly, configure });
   const failed = result.sub_templates?.filter(c => c.status === 'error') ?? [];
   if (failed.length) setError(failed.map(c => c.nom + ' : ' + c.error).join(' ; '));
   const url = target ? result.sub_templates.find(c => c.id === target)?.file_url : result.file_url;
   if (download && url) window.open(url, '_blank', 'noopener,noreferrer');
   onGenerated?.(result); router.refresh(); setDocs(await loadGenerationDocuments(propositionId));
  } catch(e) { setError(e instanceof Error ? e.message : 'Erreur de génération'); } finally { setBusy(false); }
 }
 const styles = { primary: 'px-4 py-2 text-sm bg-slate-900 text-white', secondary: 'px-4 py-2 bg-blue-50 text-blue-600', small: 'px-3 py-1.5 text-sm text-blue-600 bg-blue-50' };
 const hasChildren = !!docs?.sub_templates.length;
 const downloadMenu = hasChildren && (label?.startsWith('Télécharger') ?? false);
 return <div className="relative space-y-2">
  <button disabled={busy || !docs} aria-expanded={downloadMenu ? menu : undefined} onClick={() => downloadMenu ? setMenu(!menu) : run()} className={'flex items-center gap-2 rounded-lg font-medium disabled:opacity-60 ' + styles[variant] + ' ' + className}>
   {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon ?? <FileSpreadsheet className="h-4 w-4" />}{busy ? 'Génération…' : label ?? (variant === 'small' ? 'Générer' : 'Générer la proposition')}{downloadMenu && <ChevronDown className="h-4 w-4" />}
  </button>
  {hasChildren && !downloadMenu && <button disabled={busy} className="text-xs text-blue-700" onClick={() => run(undefined, false, true)}>Réglage et choix des annexes</button>}
  {menu && <div className="absolute right-0 z-30 min-w-64 rounded-lg border bg-white p-2 shadow-lg" role="menu">
   <button role="menuitem" className="block w-full rounded p-2 text-left text-sm hover:bg-gray-100" onClick={() => run(undefined, true)}>Proposition</button>
   {docs?.sub_templates.filter(c => docs.selected_sub_template_ids.includes(c.id)).map(c => <button role="menuitem" key={c.id} className="block w-full rounded p-2 text-left text-sm hover:bg-gray-100" onClick={() => run(c.id)}>{c.nom}{c.result?.status === 'error' && <span className="ml-2 text-xs text-red-700">Réessayer</span>}</button>)}
   <button role="menuitem" className="block w-full border-t p-2 text-left text-sm text-blue-700" onClick={() => run(undefined, false, true)}>Modifier le choix des annexes</button>
   <button className="block w-full p-2 text-left text-xs text-gray-500" onClick={() => setMenu(false)}>Fermer</button>
  </div>}
  {error && !docs && <button className="text-xs text-blue-700" onClick={() => loadGenerationDocuments(propositionId).then(d => { setDocs(d); setError(null); }).catch(e => setError(e.message))}>Réessayer le chargement</button>}
  {error && <p role="alert" className="max-w-md whitespace-normal rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
  {selectionDialog}
 </div>;
}
