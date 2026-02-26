'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Zap, ArrowRight } from 'lucide-react';

interface OnboardingSuccessModalProps {
  tourName?: string;
  onClose: () => void;
}

/* ── Confetti particle ─────────────────────────────────────── */
interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  speed: number;
  angle: number;
  rotate: number;
  rotateSpeed: number;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 8,
    speed: 1.5 + Math.random() * 2,
    angle: -70 + Math.random() * 140,
    rotate: Math.random() * 360,
    rotateSpeed: (Math.random() - 0.5) * 10,
  }));
}

/* ── Component ─────────────────────────────────────────────── */
export function OnboardingSuccessModal({ tourName, onClose }: OnboardingSuccessModalProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [particles] = useState(() => createParticles(60));
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Animate confetti via CSS + state
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const animate = () => {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const nextElapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsed(nextElapsed);
      setTick((prev) => prev + 1);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    // Stop after 3.5s
    const stop = setTimeout(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, 3500);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(stop);
    };
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Confetti particles */}
      {particles.map((p) => {
        const progress = Math.min(elapsed / 3, 1);
        const y = progress * 100 * p.speed;
        const x = p.x + Math.sin((elapsed * p.speed) / 0.5) * 5;
        const rotate = p.rotate + elapsed * p.rotateSpeed * 30;
        const opacity = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
        return (
          <div
            key={`${p.id}-${tick}`}
            className="pointer-events-none fixed"
            style={{
              left: `${x}%`,
              top: `${-5 + y}%`,
              width: p.size,
              height: p.size * 0.4,
              background: p.color,
              borderRadius: 2,
              transform: `rotate(${rotate}deg)`,
              opacity,
              transition: 'none',
            }}
          />
        );
      })}

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-center"
        style={{
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.88) translateY(24px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
        }}
      >
        {/* Top accent */}
        <div
          className="h-2 w-full"
          style={{ background: 'linear-gradient(90deg, #2563eb, #10b981, #2563eb)' }}
        />

        <div className="px-8 py-8">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              <CheckCircle2 className="text-white" size={38} />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Félicitations !
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-6">
            {tourName
              ? `Vous avez complété le guide "${tourName}". PropoBoost est prêt à vous faire gagner du temps !`
              : 'Vous avez complété le guide interactif. Vous êtes prêt à utiliser PropoBoost !'}
          </p>

          {/* CTA buttons */}
          <div className="space-y-3">
            <button
              onClick={() => {
                handleClose();
                setTimeout(() => router.push('/propositions/new'), 320);
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
              }}
            >
              <Zap size={16} />
              Créer une proposition maintenant
              <ArrowRight size={15} />
            </button>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-gray-600 font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Retour au tableau de bord
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
