'use client';

import { useEffect, useRef, useState } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { SaResumeRenderer } from '@/components/propositions/SaResumeRenderer';

interface Props {
  open: boolean;
  onClose: () => void;
  donneesExtraites: Record<string, unknown>;
  text: string;
  title?: string;
}

type DragState =
  | {
      mode: 'move';
      startX: number;
      startY: number;
      startLeft: number;
      startTop: number;
    }
  | {
      mode: 'resize';
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
      startLeft: number;
      startTop: number;
    }
  | null;

const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 420;
const EDGE_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function FloatingSaInspector({
  open,
  onClose,
  donneesExtraites,
  text,
  title = 'Resume SA',
}: Props) {
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(88);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragStateRef = useRef<DragState>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const nextWidth = clamp(DEFAULT_WIDTH, MIN_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
    const nextHeight = clamp(DEFAULT_HEIGHT, MIN_HEIGHT, window.innerHeight - 120);
    setWidth(nextWidth);
    setHeight(nextHeight);
    setLeft(Math.max(window.innerWidth - nextWidth - 32, EDGE_MARGIN));
    setTop(88);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (dragState.mode === 'move') {
        const nextLeft = clamp(
          dragState.startLeft + (event.clientX - dragState.startX),
          EDGE_MARGIN,
          Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN),
        );
        const nextTop = clamp(
          dragState.startTop + (event.clientY - dragState.startY),
          EDGE_MARGIN,
          Math.max(EDGE_MARGIN, viewportHeight - height - EDGE_MARGIN),
        );
        setLeft(nextLeft);
        setTop(nextTop);
        return;
      }

      const nextWidth = clamp(
        dragState.startWidth + (event.clientX - dragState.startX),
        MIN_WIDTH,
        Math.max(MIN_WIDTH, viewportWidth - dragState.startLeft - EDGE_MARGIN),
      );
      const nextHeight = clamp(
        dragState.startHeight + (event.clientY - dragState.startY),
        MIN_HEIGHT,
        Math.max(MIN_HEIGHT, viewportHeight - dragState.startTop - EDGE_MARGIN),
      );
      setWidth(nextWidth);
      setHeight(nextHeight);
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [open, width, height]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[80] rounded-xl border border-green-200 bg-white shadow-2xl overflow-hidden"
      style={{
        left,
        top,
        width,
        height,
        maxWidth: `calc(100vw - ${EDGE_MARGIN * 2}px)`,
        maxHeight: `calc(100vh - ${EDGE_MARGIN * 2}px)`,
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-green-100 bg-green-50/80 px-3 py-2 cursor-move"
        onMouseDown={(event) => {
          dragStateRef.current = {
            mode: 'move',
            startX: event.clientX,
            startY: event.clientY,
            startLeft: left,
            startTop: top,
          };
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-4 h-4 text-green-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-800">{title}</p>
            <p className="text-[11px] text-green-600">Deplacable et redimensionnable</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-green-500 hover:bg-green-100 hover:text-green-700 transition-colors"
          aria-label="Fermer le resume SA"
          title="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-[calc(100%-45px)] overflow-auto p-3 bg-green-50/30">
        <SaResumeRenderer text={text} variant="compact" donneesExtraites={donneesExtraites} />
      </div>

      <button
        type="button"
        aria-label="Redimensionner la fenetre"
        title="Redimensionner"
        className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize bg-gradient-to-tl from-green-200 to-transparent"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragStateRef.current = {
            mode: 'resize',
            startX: event.clientX,
            startY: event.clientY,
            startWidth: width,
            startHeight: height,
            startLeft: left,
            startTop: top,
          };
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'nwse-resize';
        }}
      >
        <span className="absolute bottom-1 right-1 block h-2.5 w-2.5 rounded-sm border-r-2 border-b-2 border-green-500" />
      </button>
    </div>
  );
}
