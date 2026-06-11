'use client';

import {
  Trophy,
  CheckCircle2,
  Wifi,
  TrendingDown,
  Phone,
  Zap,
  Shield,
  Star,
  Headphones,
  Globe,
  Rocket,
  Sparkles,
} from 'lucide-react';
import type { ResolvedObjectif } from '@/lib/sp/evaluateObjectifs';

const ICON_MAP: Record<string, React.ElementType> = {
  Wifi,
  TrendingDown,
  Phone,
  Zap,
  Shield,
  Star,
  Headphones,
  Globe,
  Rocket,
  Sparkles,
  Trophy,
};

const CARD_COLORS = [
  { border: 'border-emerald-400', icon: 'bg-emerald-50 text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' },
  { border: 'border-blue-400',    icon: 'bg-blue-50 text-blue-600',       badge: 'bg-blue-50 text-blue-700'    },
  { border: 'border-violet-400',  icon: 'bg-violet-50 text-violet-600',   badge: 'bg-violet-50 text-violet-700' },
  { border: 'border-amber-400',   icon: 'bg-amber-50 text-amber-600',     badge: 'bg-amber-50 text-amber-700'  },
  { border: 'border-rose-400',    icon: 'bg-rose-50 text-rose-600',       badge: 'bg-rose-50 text-rose-700'    },
];

interface Props {
  resolvedObjectifs: ResolvedObjectif[];
}

export default function SpObjectifsAccomplis({ resolvedObjectifs }: Props) {
  if (resolvedObjectifs.length === 0) return null;

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 p-6 mb-4 shadow-lg">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Objectifs accomplis</h3>
              <p className="text-sm text-white/80">Votre solution répond à vos besoins</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 text-white" />
            <span className="text-sm font-semibold text-white">
              {resolvedObjectifs.length} {resolvedObjectifs.length === 1 ? 'objectif atteint' : 'objectifs atteints'}
            </span>
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-6 h-20 w-20 rounded-full bg-white/10" />
        <div className="absolute left-1/2 -bottom-10 h-24 w-24 rounded-full bg-white/5" />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {resolvedObjectifs.map((item, index) => {
          const color = CARD_COLORS[index % CARD_COLORS.length];
          const IconComponent = item.config.icone ? (ICON_MAP[item.config.icone] ?? Star) : Star;
          const delayMs = index * 80;

          return (
            <div
              key={item.config.id}
              className={`relative overflow-hidden rounded-xl border-l-4 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${color.border}`}
              style={{
                animationDelay: `${delayMs}ms`,
                animation: 'fadeSlideIn 0.4s ease-out both',
              }}
            >
              {/* Check badge top-right */}
              <div className="absolute right-4 top-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
              </div>

              {/* Icon + title */}
              <div className="mb-3 flex items-start gap-3 pr-10">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${color.icon}`}>
                  <IconComponent className="h-4.5 w-4.5" />
                </div>
                <h4 className="pt-1.5 text-sm font-semibold leading-snug text-gray-900">
                  {item.config.titre}
                </h4>
              </div>

              {/* Message texts */}
              {item.textes.length > 0 && (
                <div className="space-y-2 pl-12">
                  {item.textes.map((t, ti) => (
                    <p key={ti} className="text-sm leading-relaxed text-gray-600">
                      {t}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
