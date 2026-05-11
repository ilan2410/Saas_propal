'use client';

import { Button } from '@/components/ui/button';
import { MapPin, Building2, AlertCircle } from 'lucide-react';

export interface MultisiteChoiceModalProps {
  sites: Array<{
    nom: string;
    adresse: string;
    ville: string;
    nb_lignes: number;
  }>;
  tarifCloneSite: number;
  onChoiceParSite: () => void;
  onChoiceToutInclure: () => void;
  onChoicePasMultisite: () => void;
}

export function MultisiteChoiceModal({
  sites,
  tarifCloneSite,
  onChoiceParSite,
  onChoiceToutInclure,
  onChoicePasMultisite,
}: MultisiteChoiceModalProps) {
  const extraCost = tarifCloneSite * (sites.length - 1);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Plusieurs sites détectés</h2>
          </div>
          <p className="text-sm text-gray-600">
            L&apos;IA a identifié <span className="font-semibold">{sites.length} adresses distinctes</span> dans les documents.
            Vérifiez et choisissez comment procéder.
          </p>
        </div>

        {/* Sites list */}
        <div className="px-6 py-4 space-y-2 max-h-48 overflow-y-auto">
          {sites.map((site, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{site.nom || `Site ${i + 1}`}</p>
                <p className="text-xs text-gray-500 truncate">{site.adresse}{site.ville ? `, ${site.ville}` : ''}</p>
              </div>
              <span className="text-xs text-gray-500 shrink-0">{site.nb_lignes} ligne{site.nb_lignes > 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 space-y-3 border-t border-gray-100">

          {/* Option 1: Par site */}
          <button
            onClick={onChoiceParSite}
            className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-green-500 bg-green-50 hover:bg-green-100 transition-colors text-left"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-green-900">Générer une proposition par site</span>
                <span className="bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">Recommandé</span>
              </div>
              <p className="text-xs text-green-700">
                Une proposition dédiée par site, données filtrées automatiquement.
              </p>
              {extraCost > 0 && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  + {extraCost.toFixed(2)} crédit{extraCost > 1 ? 's' : ''} ({sites.length - 1} site{sites.length - 1 > 1 ? 's' : ''} × {tarifCloneSite.toFixed(2)} €)
                </p>
              )}
            </div>
          </button>

          {/* Option 2: Tout inclure */}
          <button
            onClick={onChoiceToutInclure}
            className="w-full flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 mb-1">Tout inclure dans une seule proposition</p>
              <p className="text-xs text-gray-500">Tous les sites dans la même proposition. Coût normal.</p>
            </div>
          </button>

          {/* Option 3: Pas un multisite */}
          <Button
            variant="ghost"
            onClick={onChoicePasMultisite}
            className="w-full justify-start text-left h-auto px-4 py-3 text-gray-400 hover:text-gray-600"
          >
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <div>
              <p className="text-sm font-medium">Ce n&apos;est pas un multisite</p>
              <p className="text-xs text-gray-400">L&apos;IA a confondu une adresse fournisseur ou annexe. Continuer normalement. — 0 crédit supplémentaire</p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
