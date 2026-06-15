'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DraggablePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
}

type DragState = {
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
} | null;

const EDGE_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function DraggablePanel({
  isOpen,
  onClose,
  title,
  children,
  defaultWidth = 560,
  defaultHeight = 480,
}: DraggablePanelProps) {
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const dragStateRef = useRef<DragState>(null);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    setLeft(Math.round((window.innerWidth - defaultWidth) / 2));
    setTop(Math.round((window.innerHeight - defaultHeight) / 2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setLeft(clamp(ds.startLeft + (e.clientX - ds.startX), EDGE_MARGIN, Math.max(EDGE_MARGIN, vw - defaultWidth - EDGE_MARGIN)));
      setTop(clamp(ds.startTop + (e.clientY - ds.startY), EDGE_MARGIN, Math.max(EDGE_MARGIN, vh - defaultHeight - EDGE_MARGIN)));
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
  }, [defaultWidth, defaultHeight]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[70] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
      style={{ left, top, width: defaultWidth, height: defaultHeight }}
    >
      <div
        className="shrink-0 flex items-center justify-between gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 cursor-move"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          dragStateRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startLeft: left,
            startTop: top,
          };
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
        }}
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {children}
      </div>
    </div>
  );
}
