'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface FloatingModalProps {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  backdrop?: ReactNode;
}

type DragState =
  | { mode: 'move'; startX: number; startY: number; startLeft: number; startTop: number }
  | { mode: 'resize'; startX: number; startY: number; startWidth: number; startHeight: number; startLeft: number; startTop: number }
  | null;

const EDGE_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function FloatingModal({
  header,
  footer,
  children,
  defaultWidth = 860,
  defaultHeight = 620,
  minWidth = 480,
  minHeight = 400,
  backdrop,
}: FloatingModalProps) {
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const dragStateRef = useRef<DragState>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = clamp(defaultWidth, minWidth, window.innerWidth - EDGE_MARGIN * 2);
    const h = clamp(defaultHeight, minHeight, window.innerHeight - EDGE_MARGIN * 2);
    setWidth(w);
    setHeight(h);
    setLeft(Math.round((window.innerWidth - w) / 2));
    setTop(Math.round((window.innerHeight - h) / 2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (ds.mode === 'move') {
        setLeft(clamp(ds.startLeft + (e.clientX - ds.startX), EDGE_MARGIN, Math.max(EDGE_MARGIN, vw - width - EDGE_MARGIN)));
        setTop(clamp(ds.startTop + (e.clientY - ds.startY), EDGE_MARGIN, Math.max(EDGE_MARGIN, vh - height - EDGE_MARGIN)));
      } else {
        setWidth(clamp(ds.startWidth + (e.clientX - ds.startX), minWidth, Math.max(minWidth, vw - ds.startLeft - EDGE_MARGIN)));
        setHeight(clamp(ds.startHeight + (e.clientY - ds.startY), minHeight, Math.max(minHeight, vh - ds.startTop - EDGE_MARGIN)));
      }
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
  }, [width, height, minWidth, minHeight]);

  return (
    <>
      {backdrop !== undefined ? backdrop : <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50" />}
      <div
        className="fixed z-[55] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
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
          className="shrink-0 cursor-move"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
            dragStateRef.current = {
              mode: 'move',
              startX: e.clientX,
              startY: e.clientY,
              startLeft: left,
              startTop: top,
            };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
          }}
        >
          {header}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>

        {footer && <div className="shrink-0">{footer}</div>}

        <button
          type="button"
          aria-label="Redimensionner la fenêtre"
          title="Redimensionner"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize bg-gradient-to-tl from-gray-200 to-transparent"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragStateRef.current = {
              mode: 'resize',
              startX: e.clientX,
              startY: e.clientY,
              startWidth: width,
              startHeight: height,
              startLeft: left,
              startTop: top,
            };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'nwse-resize';
          }}
        >
          <span className="absolute bottom-1 right-1 block h-2.5 w-2.5 rounded-sm border-r-2 border-b-2 border-gray-400" />
        </button>
      </div>
    </>
  );
}
