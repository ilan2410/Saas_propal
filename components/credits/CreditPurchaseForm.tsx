'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Check, ArrowRight } from 'lucide-react';

// Forfaits prédéfinis
const FORFAITS = [
  { 
    montant: 50, 
    bonus: 0, 
    label: '50€', 
    description: 'Starter',
    subtitle: 'Pour commencer',
    popular: false 
  },
  { 
    montant: 100, 
    bonus: 5, 
    label: '100€', 
    description: 'Pro', 
    subtitle: 'Le plus populaire',
    popular: true 
  },
  { 
    montant: 250, 
    bonus: 10, 
    label: '250€', 
    description: 'Business',
    subtitle: 'Pour les équipes',
    popular: false 
  },
  { 
    montant: 500, 
    bonus: 15, 
    label: '500€', 
    description: 'Enterprise',
    subtitle: 'Maximum d\'économies',
    popular: false 
  },
];

interface Props {
  organizationId: string;
}

export function CreditPurchaseForm({ organizationId }: Props) {
  const [selectedForfait, setSelectedForfait] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const calculateBonus = (montant: number): number => {
    if (montant >= 1000) return 20;
    if (montant >= 500) return 15;
    if (montant >= 250) return 10;
    if (montant >= 100) return 5;
    return 0;
  };

  const handlePurchase = async (montant: number) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montant,
          organization_id: organizationId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Erreur création session');
      }

      const { url } = result;
      if (!url) throw new Error('URL Stripe manquante');

      window.location.assign(url);
    } catch (error) {
      console.error('Erreur achat:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      alert(`Erreur lors de l'achat de crédits:\n\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForfaitClick = (montant: number) => {
    setSelectedForfait(montant);
    setCustomAmount('');
  };

  const handleForfaitPurchase = () => {
    if (!selectedForfait) return;
    handlePurchase(selectedForfait);
  };

  const handleCustomPurchase = () => {
    const montant = parseFloat(customAmount);
    if (isNaN(montant) || montant < 10) {
      alert('Le montant minimum est 10€');
      return;
    }
    if (montant > 10000) {
      alert('Le montant maximum est 10000€');
      return;
    }
    handlePurchase(montant);
  };

  const calculateCredits = (montant: number, bonus: number) => {
    return montant * (1 + bonus / 100);
  };

  const customMontantParsed = customAmount ? parseFloat(customAmount) : NaN;
  const customIsValid =
    !isNaN(customMontantParsed) && customMontantParsed >= 10 && customMontantParsed <= 10000;
  const customBonus = customIsValid ? calculateBonus(customMontantParsed) : 0;
  const customCreditsTotal =
    customIsValid ? calculateCredits(customMontantParsed, customBonus) : 0;

  return (
    <div className="space-y-8">
      {/* Forfaits */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FORFAITS.map((forfait) => {
          const isSelected = selectedForfait === forfait.montant;
          const creditsTotal = calculateCredits(forfait.montant, forfait.bonus);

          return (
            <button
              key={forfait.montant}
              onClick={() => handleForfaitClick(forfait.montant)}
              disabled={isLoading}
              className={`group relative overflow-hidden rounded-2xl border-2 bg-white p-6 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                forfait.popular
                  ? 'border-emerald-500 shadow-lg shadow-emerald-500/20'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              } ${isSelected ? 'scale-[0.98] ring-2 ring-emerald-400 ring-offset-2' : ''}`}
            >
              {/* Badge populaire */}
              {forfait.popular && (
                <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500" />
              )}
              {forfait.popular && (
                <div className="absolute right-3 top-3 z-10">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    Populaire
                  </span>
                </div>
              )}

              <div className="relative">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {forfait.description}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">{forfait.subtitle}</p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      {forfait.montant}
                    </span>
                    <span className="text-2xl font-medium text-gray-500">€</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-600">
                    = {creditsTotal.toFixed(2)}€ de crédits
                  </p>
                </div>

                {forfait.bonus > 0 ? (
                  <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-md">
                    <Check className="h-3.5 w-3.5" />
                    +{forfait.bonus}% bonus inclus
                  </div>
                ) : (
                  <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                    Sans bonus
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
                  {isSelected ? 'Sélectionné' : 'Choisir ce forfait'}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedForfait && (
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Forfait sélectionné</p>
              <p className="mt-1 text-sm text-gray-600">
                {(() => {
                  const f = FORFAITS.find((x) => x.montant === selectedForfait);
                  if (!f) return null;
                  const total = calculateCredits(f.montant, f.bonus);
                  return (
                    <>
                      <span className="font-semibold text-gray-900">{f.description}</span>
                      <span className="text-gray-600"> — </span>
                      <span className="font-semibold text-gray-900">{f.montant}€</span>
                      <span className="text-gray-600"> (</span>
                      <span className="font-semibold text-gray-900">{total.toFixed(2)}€</span>
                      <span className="text-gray-600"> de crédits)</span>
                    </>
                  );
                })()}
              </p>
            </div>

            <button
              onClick={handleForfaitPurchase}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {isLoading ? 'Redirection...' : 'Payer maintenant'}
            </button>
          </div>
        </div>
      )}

      {/* Montant personnalisé */}
      <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-white p-8">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900">Montant personnalisé</h3>
          <p className="mt-1 text-sm text-gray-600">
            {"Besoin d'un montant spécifique ? Entrez le montant souhaité (10€ - 10 000€)"}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="custom-amount"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Montant en euros
              </label>
              <div className="relative">
                <input
                  id="custom-amount"
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="100"
                  min="10"
                  max="10000"
                  step="10"
                  className="w-full rounded-xl border-2 border-gray-300 bg-white px-5 py-3.5 pr-12 text-base font-medium outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-base font-semibold text-gray-500">
                  €
                </div>
              </div>
            </div>

            <button
              onClick={handleCustomPurchase}
              disabled={isLoading || !customAmount || !customIsValid}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-auto"
            >
              {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
              {isLoading ? 'Redirection...' : 'Payer maintenant'}
            </button>
          </div>

          {customIsValid && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                Bonus: {customBonus}%
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                Total: {customCreditsTotal.toFixed(2)}€ de crédits
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
