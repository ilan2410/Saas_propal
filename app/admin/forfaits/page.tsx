import { Sparkles, TrendingUp } from 'lucide-react';

export default function ForfaitsPage() {
  const forfaits = [
    { montant: 50, bonus: 0, label: 'Starter' },
    { montant: 100, bonus: 5, label: 'Pro' },
    { montant: 250, bonus: 10, label: 'Business' },
    { montant: 500, bonus: 15, label: 'Enterprise' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Forfaits & Bonus</h1>
        <p className="text-gray-600 mt-2">
          Configuration des forfaits de crédits et des bonus
        </p>
      </div>

      {/* Forfaits actuels */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-900">
            Forfaits configurés
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {forfaits.map((forfait) => (
            <div
              key={forfait.montant}
              className="p-6 rounded-lg border-2 border-gray-200 bg-gray-50"
            >
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {forfait.montant}€
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {forfait.label}
              </div>
              {forfait.bonus > 0 ? (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                  +{forfait.bonus}% bonus
                </div>
              ) : (
                <div className="text-xs text-gray-400">Pas de bonus</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Règles de bonus */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-bold text-gray-900">
            Règles de bonus
          </h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">≥ 500€</p>
              <p className="text-sm text-gray-600">Enterprise</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">+15%</p>
              <p className="text-xs text-gray-500">bonus</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">≥ 250€</p>
              <p className="text-sm text-gray-600">Business</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">+10%</p>
              <p className="text-xs text-gray-500">bonus</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">≥ 100€</p>
              <p className="text-sm text-gray-600">Pro</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">+5%</p>
              <p className="text-xs text-gray-500">bonus</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">{'< 100€'}</p>
              <p className="text-sm text-gray-600">Starter</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-400">0%</p>
              <p className="text-xs text-gray-500">pas de bonus</p>
            </div>
          </div>
        </div>
      </div>

      {/* Informations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">
          ℹ️ Configuration
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Les forfaits sont définis dans le code (hardcodés)</li>
          <li>• Les bonus sont calculés automatiquement selon le montant</li>
          <li>• Les clients peuvent aussi acheter un montant personnalisé</li>
          <li>• Montant minimum : 10€ - Maximum : 10 000€</li>
        </ul>
      </div>
    </div>
  );
}
