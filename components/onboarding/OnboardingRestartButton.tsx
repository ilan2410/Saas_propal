'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OnboardingRestartButtonProps {
  toursSeen?: string[];
}

interface TourOption {
  id: string;
  label: string;
  href: string;
  emoji: string;
}

const TOUR_OPTIONS: TourOption[] = [
  {
    id: 'template',
    label: 'Guide : Créer une template',
    href: '/templates/new?tour=template',
    emoji: '📄',
  },
  {
    id: 'proposition',
    label: 'Guide : Créer une proposition',
    href: '/propositions/new?tour=proposition',
    emoji: '⚡',
  },
  {
    id: 'catalogue',
    label: 'Guide : Configurer le catalogue',
    href: '/catalogue?tour=catalogue',
    emoji: '📦',
  },
];

export function OnboardingRestartButton({ toursSeen = [] }: OnboardingRestartButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
      >
        <BookOpen size={15} />
        Revoir le guide
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-2 w-64 overflow-hidden">
            <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Choisissez un guide
            </p>
            {TOUR_OPTIONS.map((option) => {
              const seen = toursSeen.includes(option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(option.href);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
                >
                  <span className="text-base">{option.emoji}</span>
                  <span className="flex-1">{option.label}</span>
                  {seen && (
                    <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                      vu
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
