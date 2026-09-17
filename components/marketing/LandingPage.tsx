import Link from 'next/link';
import Image from 'next/image';
import { FileText, Zap, Building2 } from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'Extraction automatique',
    description:
      "Importez vos factures et contrats clients : l'IA en extrait automatiquement les données utiles.",
  },
  {
    icon: Zap,
    title: 'Génération instantanée',
    description:
      'Vos propositions commerciales (Word, Excel, PDF) sont générées en quelques secondes, prêtes à envoyer.',
  },
  {
    icon: Building2,
    title: 'Multi-organisation',
    description:
      'Gérez plusieurs équipes ou clients avec des modèles et paramètres dédiés à chaque organisation.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      <header className="px-4 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Logo" width={36} height={36} />
            <span className="font-bold text-gray-900 text-lg">Proboost</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-5xl mx-auto px-4 py-12 w-full">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
              Générez vos propositions commerciales en quelques minutes
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Proboost automatise la génération de propositions commerciales pour les
              secteurs de la téléphonie et de la bureautique, grâce à l&apos;extraction
              intelligente de vos documents clients.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Créer un compte gratuitement
              </Link>
              <Link
                href="/login"
                className="px-6 py-3 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
              >
                Se connecter
              </Link>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="bg-white rounded-2xl p-6 shadow-sm">
                <feature.icon className="w-8 h-8 text-blue-600 mb-3" />
                <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="px-4 py-6 border-t border-gray-200 bg-white/60">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Livenot. Tous droits réservés.</p>
          <div className="flex items-center gap-4">
            <Link href="/confidentialite" className="hover:text-gray-700">
              Politique de confidentialité
            </Link>
            <Link href="/cgu" className="hover:text-gray-700">
              CGU
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
