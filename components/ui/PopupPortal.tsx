'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopupPortalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBlocked: () => void;
  title: string;
  windowName?: string;
  width?: number;
  height?: number;
  children: ReactNode;
}

// Une popup ouverte via window.open('', ...) démarre avec un document vide :
// elle n'hérite d'aucune des feuilles de style compilées par Next.js. On les
// clone dans son <head> pour que les classes Tailwind s'y appliquent.
function copyStylesInto(targetDoc: Document) {
  targetDoc
    .querySelectorAll('[data-popup-copied]')
    .forEach((node) => node.remove());

  document.head
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-popup-copied', 'true');
      targetDoc.head.appendChild(clone);
    });
}

export function PopupPortal({
  isOpen,
  onClose,
  onOpenBlocked,
  title,
  windowName = 'popup-portal',
  width = 340,
  height = 760,
  children,
}: PopupPortalProps) {
  const popupRef = useRef<Window | null>(null);
  const [popupWindow, setPopupWindow] = useState<Window | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      popupRef.current = null;
      setPopupWindow(null);
      return;
    }

    const win = window.open('', windowName, `width=${width},height=${height}`);
    if (!win) {
      onOpenBlocked();
      return;
    }

    win.document.title = title;
    copyStylesInto(win.document);

    const handleUnload = () => onClose();
    win.addEventListener('beforeunload', handleUnload);

    popupRef.current = win;
    setPopupWindow(win);

    return () => {
      win.removeEventListener('beforeunload', handleUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Filet de sécurité : si le composant est démonté pendant que la popup est
  // ouverte (navigation, changement de page), on ne laisse pas de fenêtre
  // orpheline derrière soi.
  useEffect(() => {
    return () => {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
  }, []);

  if (!popupWindow || popupWindow.closed) return null;

  return createPortal(children, popupWindow.document.body);
}
