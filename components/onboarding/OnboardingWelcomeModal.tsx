'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, FileText, Zap, BookOpen } from 'lucide-react';

interface OnboardingWelcomeModalProps {
  organizationName?: string;
  onClose: () => void;
}

export function OnboardingWelcomeModal({
  organizationName,
  onClose,
}: OnboardingWelcomeModalProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Entrée progressive
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleTemplateGuide() {
    handleClose();
    setTimeout(() => router.push('/templates/new?tour=template'), 320);
  }

  function handlePropositionGuide() {
    handleClose();
    setTimeout(() => router.push('/propositions/new?tour=proposition'), 320);
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        style={{
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
        }}
      >
        {/* Header gradient */}
        <div
          className="px-8 pt-8 pb-6 text-white"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>

          {/* Stars decoration */}
          <div className="flex gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <span key={i} className="text-yellow-300 text-lg" style={{ animationDelay: `${i * 80}ms` }}>
                ✦
              </span>
            ))}
          </div>

          <h2 className="text-2xl font-bold mb-2">
            Bienvenue{organizationName ? `, ${organizationName}` : ''} !
          </h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            PropoBoost est prêt. Laissez-nous vous guider en 2 minutes pour créer votre
            première proposition commerciale.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-4">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Par où commencer ?
          </p>

          {/* Option 1 — Template */}
          <button
            onClick={handleTemplateGuide}
            className="w-full group flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left"
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              <FileText className="text-white" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                Créer ma première template
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                Uploadez votre modèle Word ou Excel et configurez les variables.
              </p>
            </div>
            <span className="text-gray-400 group-hover:text-blue-500 transition-colors mt-1">→</span>
          </button>

          {/* Option 2 — Proposition */}
          <button
            onClick={handlePropositionGuide}
            className="w-full group flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
              <Zap className="text-white" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                Créer ma première proposition
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                Uploadez les documents client et laissez l&apos;IA extraire les données.
              </p>
            </div>
            <span className="text-gray-400 group-hover:text-emerald-500 transition-colors mt-1">→</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <BookOpen size={13} />
            <span>Guide interactif — 2 min</span>
          </div>
          <button
            onClick={handleClose}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Passer pour l&apos;instant
          </button>
        </div>
      </div>
    </div>
  );
}
