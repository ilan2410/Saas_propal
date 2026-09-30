'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/utils/formatting';

type Inventaire = {
  files: number;
  bytes: number;
  apercu: { bucket: string; nom: string; bytes: number }[];
};

/**
 * Suppression des fichiers orphelins. Deux temps imposés : on demande d'abord
 * au serveur ce qui serait supprimé, on ne confirme qu'ensuite. Le navigateur
 * n'envoie jamais de liste de fichiers — le serveur la recalcule.
 */
export function OrphanCleanupButton({ organizationId }: { organizationId?: string }) {
  const router = useRouter();
  const [inventaire, setInventaire] = useState<Inventaire | null>(null);
  const [chargement, setChargement] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const query = organizationId ? `?organizationId=${organizationId}` : '';

  const inventorier = async () => {
    setChargement(true);
    try {
      const response = await fetch(`/api/admin/storage/orphans${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Inventaire impossible');
      if (data.files === 0) {
        toast.success('Aucun fichier orphelin.');
        return;
      }
      setInventaire(data as Inventaire);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Inventaire impossible');
    } finally {
      setChargement(false);
    }
  };

  const supprimer = async () => {
    if (!inventaire || suppression) return;
    setSuppression(true);
    try {
      const separateur = query ? '&' : '?';
      const response = await fetch(`/api/admin/storage/orphans${query}${separateur}confirm=true`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Suppression impossible');

      if (Array.isArray(data.echecs) && data.echecs.length > 0) {
        toast.warning(`${data.supprimes} fichier(s) supprimé(s), ${data.echecs.length} lot(s) en échec. Voir les logs serveur.`);
      } else {
        toast.success(`${data.supprimes} fichier(s) supprimé(s).`);
      }
      setInventaire(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    } finally {
      setSuppression(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void inventorier()} disabled={chargement}>
        {chargement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Nettoyer les fichiers orphelins
      </Button>

      {inventaire && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Supprimer {inventaire.files} fichier(s) orphelin(s) ?
            </h3>
            <p className="text-sm text-gray-600">
              {formatFileSize(inventaire.bytes)} seront libérés{' '}
              {organizationId ? 'pour ce client' : 'sur toute la plateforme'}. Ces fichiers ne sont
              référencés par aucun template ni aucune proposition. <strong>La suppression est
              définitive et sans retour possible.</strong>
            </p>

            {inventaire.apercu.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Aperçu ({inventaire.apercu.length} sur {inventaire.files})
                </p>
                <ul className="space-y-1 font-mono text-xs text-gray-600">
                  {inventaire.apercu.map((fichier) => (
                    <li key={`${fichier.bucket}/${fichier.nom}`} className="truncate">
                      {fichier.bucket}/{fichier.nom}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setInventaire(null)} disabled={suppression}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={() => void supprimer()} disabled={suppression}>
                {suppression && <Loader2 className="h-4 w-4 animate-spin" />}
                Supprimer définitivement
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
