'use client';

/**
 * OnboardingGuide — Guide séquentiel custom PropoBoost
 *
 * Toutes les positions sont en `position: fixed` (viewport) pour éviter
 * les problèmes de scroll. Attend chaque élément DOM avec MutationObserver
 * avant d'afficher l'étape, sans jamais filtrer les étapes à l'avance.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import type { TourStepConfig } from '@/lib/onboarding/onboarding.types';

// ── Types ──────────────────────────────────────────────────────
interface VRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PPos {
  top: number;
  left: number;
  side: string;
}

interface OnboardingGuideProps {
  steps: TourStepConfig[];
  onComplete: () => void;
  onSkip: () => void;
}

// ── Helpers ────────────────────────────────────────────────────
const PAD = 10;
const PW  = 360;
const GAP = 14;

function waitForEl(selector: string, timeout = 12000): Promise<Element | null> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { mo.disconnect(); resolve(el); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve(null); }, timeout);
  });
}

function calcPos(spot: VRect, prefer?: string): PPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const order = ['bottom', 'top', 'right', 'left'] as const;
  type S = typeof order[number];
  const sides: S[] = prefer && (order as readonly string[]).includes(prefer)
    ? [prefer as S, ...order.filter(s => s !== prefer)]
    : [...order];

  for (const side of sides) {
    let top = 0;
    let left = 0;
    if (side === 'bottom') { top = spot.top + spot.height + GAP; left = spot.left + spot.width / 2 - PW / 2; }
    else if (side === 'top') { top = spot.top - 230 - GAP; left = spot.left + spot.width / 2 - PW / 2; }
    else if (side === 'right') { top = spot.top + spot.height / 2 - 115; left = spot.left + spot.width + GAP; }
    else { top = spot.top + spot.height / 2 - 115; left = spot.left - PW - GAP; }

    left = Math.max(10, Math.min(left, vw - PW - 10));
    top  = Math.max(10, top);

    const ok =
      (side === 'bottom' && top + 220 < vh) ||
      (side === 'top'    && top > 10) ||
      (side === 'right'  && left + PW < vw - 10) ||
      (side === 'left'   && left > 10);

    if (ok) return { top, left, side };
  }
  return { top: Math.min(spot.top + spot.height + GAP, vh - 240), left: Math.max(10, Math.min(spot.left + spot.width / 2 - PW / 2, vw - PW - 10)), side: 'bottom' };
}

// ── Component ──────────────────────────────────────────────────
export function OnboardingGuide({ steps, onComplete, onSkip }: OnboardingGuideProps) {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [spot,    setSpot]    = useState<VRect | null>(null);
  const [ppos,    setPpos]    = useState<PPos | null>(null);
  const rafRef = useRef<number | null>(null);

  const step = steps[idx];

  // rAF loop pour tracker la position de l'élément
  const startTracking = useCallback((el: Element, prefer?: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const loop = () => {
      const r = el.getBoundingClientRect();
      const vr: VRect = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setSpot(vr);
      setPpos(calcPos(vr, prefer));
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }, []);

  const stopTracking = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // Naviguer vers une étape
  const go = useCallback(async (i: number) => {
    if (i >= steps.length) { onComplete(); return; }
    stopTracking();
    setVisible(false);
    setWaiting(true);
    setIdx(i);

    const s = steps[i];
    let el: Element | null = null;

    if (s.element) {
      el = await waitForEl(s.element);
      if (!el) { go(i + 1); return; } // jamais apparu → passe
    }

    setWaiting(false);

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await new Promise(r => setTimeout(r, 380));
      startTracking(el, s.side);
    } else {
      setSpot(null);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPpos({ top: vh / 2 - 115, left: vw / 2 - PW / 2, side: 'center' });
    }

    setTimeout(() => setVisible(true), 80);
  }, [steps, onComplete, stopTracking, startTracking]);

  // Init
  useEffect(() => {
    go(0);
    return stopTracking;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') go(idx + 1);
      if (e.key === 'ArrowLeft') go(Math.max(0, idx - 1));
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, go, onSkip]);

  if (!step) return null;

  const isFirst = idx === 0;
  const isLast  = idx === steps.length - 1;

  return (
    <>
      {/* ── Overlay SVG fixed (viewport) ── */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none' }}
      >
        {spot ? (
          <svg width="100%" height="100%" style={{ display: 'block' }}>
            <defs>
              <mask id="ob-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect x={spot.left} y={spot.top} width={spot.width} height={spot.height} rx={10} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#ob-mask)" />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
        )}
      </div>

      {/* ── Spotlight border fixed ── */}
      {spot && (
        <div
          style={{
            position: 'fixed',
            top: spot.top, left: spot.left, width: spot.width, height: spot.height,
            borderRadius: 10,
            border: '2.5px solid #2563eb',
            boxShadow: '0 0 0 4px rgba(37,99,235,0.18)',
            zIndex: 9991,
            pointerEvents: 'none',
            animation: 'ob-pulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* ── Popover fixed ── */}
      {ppos && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: ppos.top, left: ppos.left, width: PW,
            zIndex: 9992,
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
            background: '#fff',
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(8px)',
            transition: 'opacity 0.2s ease, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', padding: '16px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.4, flex: 1 }}>
              {step.title}
            </h3>
            <button onClick={onSkip}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 17, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
              title="Passer le guide">
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '16px 20px 0' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.65 }}
               dangerouslySetInnerHTML={{ __html: step.description }} />
            {step.tip && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '9px 13px', marginTop: 12, fontSize: 13, color: '#92400e', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0 }}>💡</span>
                <span dangerouslySetInnerHTML={{ __html: step.tip }} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', marginTop: 14 }}>
            {/* Dots de progression */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {steps.map((_, i) => (
                <div key={i} style={{
                  width: i === idx ? 18 : 7, height: 7, borderRadius: 4,
                  background: i === idx ? '#2563eb' : '#e5e7eb',
                  transition: 'all 0.25s ease',
                }} />
              ))}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isFirst ? (
                <button onClick={onSkip}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit', padding: '7px 4px' }}>
                  Passer
                </button>
              ) : (
                <button onClick={() => go(idx - 1)}
                  style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ← Retour
                </button>
              )}
              <button
                onClick={() => go(idx + 1)}
                disabled={waiting}
                style={{
                  background: waiting ? '#93c5fd' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                  border: 'none', borderRadius: 8, padding: '8px 18px',
                  fontSize: 13, fontWeight: 600, color: '#fff',
                  cursor: waiting ? 'wait' : 'pointer',
                  boxShadow: '0 3px 10px rgba(37,99,235,0.3)',
                  fontFamily: 'inherit', transition: 'all 0.15s ease',
                }}
              >
                {waiting ? '⏳' : isLast ? 'Terminer ✓' : 'Suivant →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe */}
      <style>{`@keyframes ob-pulse{0%,100%{box-shadow:0 0 0 4px rgba(37,99,235,0.18)}50%{box-shadow:0 0 0 9px rgba(37,99,235,0.05)}}`}</style>
    </>
  );
}
