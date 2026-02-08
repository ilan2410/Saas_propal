import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info } from 'lucide-react';

interface DownloadWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changedProductsCount: number;
  hasAnalysisUpdates: boolean;
  hasSynthesisUpdate: boolean;
}

export function DownloadWarningModal({
  isOpen,
  onClose,
  onConfirm,
  changedProductsCount,
  hasAnalysisUpdates,
  hasSynthesisUpdate,
}: DownloadWarningModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 text-amber-600 mb-2">
            <AlertTriangle className="h-6 w-6" />
            <DialogTitle className="text-xl">Attention : Incohérences détectées</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Vous avez modifié <strong>{changedProductsCount} produit{changedProductsCount > 1 ? 's' : ''}</strong> mais 
            certains textes n&apos;ont pas été mis à jour en conséquence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-2">
            <p className="font-medium text-amber-900 text-sm">Problèmes potentiels :</p>
            <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
              {!hasAnalysisUpdates && (
                <li>Les justifications (&quot;Notre analyse&quot;) correspondent aux anciens produits.</li>
              )}
              {!hasSynthesisUpdate && (
                <li>La synthèse finale ne reflète pas vos changements.</li>
              )}
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Recommandation :</p>
              <p>
                Il est conseillé de régénérer les analyses et la synthèse avec l&apos;IA (icône baguette magique) 
                ou de les modifier manuellement avant de télécharger le PDF.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={onClose}>
            Retour pour modifier
          </Button>
          <Button 
            className="bg-amber-600 hover:bg-amber-700 text-white" 
            onClick={onConfirm}
          >
            Télécharger quand même
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
