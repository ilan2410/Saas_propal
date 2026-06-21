'use client';

import { useEffect, useRef, useState } from 'react';
import { GripHorizontal, X, User } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  donneesExtraites: Record<string, unknown>;
  onSave: (nextDonnees: Record<string, unknown>) => void;
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
const DEFAULT_HEIGHT = 520;
const EDGE_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Champs plats de `client.*` relus par la template Word et le comparatif SA/SP. */
type ClientEdit = {
  raison_sociale: string;
  nom: string;
  prenom: string;
  fonction: string;
  email: string;
  mobile: string;
  fixe: string;
  adresse: string;
  code_postal: string;
  ville: string;
  siret: string;
};

function getStr(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/** Initialise le formulaire depuis les données SA (`client.*`). */
function initEdit(donneesExtraites: Record<string, unknown>): ClientEdit {
  const client = isRecord(donneesExtraites.client) ? donneesExtraites.client : {};
  return {
    raison_sociale: getStr(client, 'raison_sociale'),
    nom: getStr(client, 'nom'),
    prenom: getStr(client, 'prenom'),
    fonction: getStr(client, 'fonction'),
    email: getStr(client, 'email'),
    mobile: getStr(client, 'mobile'),
    fixe: getStr(client, 'fixe'),
    adresse: getStr(client, 'adresse'),
    code_postal: getStr(client, 'code_postal'),
    ville: getStr(client, 'ville'),
    siret: getStr(client, 'siret') || getStr(client, 'siren'),
  };
}

/** Géométrie initiale du panneau (ancré en haut à droite). */
function initGeometry() {
  if (typeof window === 'undefined') {
    return { left: 0, top: 88, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  const width = clamp(DEFAULT_WIDTH, MIN_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
  const height = clamp(DEFAULT_HEIGHT, MIN_HEIGHT, window.innerHeight - 120);
  const left = Math.max(window.innerWidth - width - 32, EDGE_MARGIN);
  return { left, top: 88, width, height };
}

export function FloatingClientCoordonnees({ open, onClose, donneesExtraites, onSave }: Props) {
  // Le composant est monté à l'ouverture (rendu conditionnel côté parent) : on
  // initialise géométrie et formulaire en lazy initializers, sans effet de sync.
  const [left, setLeft] = useState(() => initGeometry().left);
  const [top, setTop] = useState(() => initGeometry().top);
  const [width, setWidth] = useState(() => initGeometry().width);
  const [height, setHeight] = useState(() => initGeometry().height);
  const [edit, setEdit] = useState<ClientEdit>(() => initEdit(donneesExtraites));
  const dragStateRef = useRef<DragState>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const setField = (key: keyof ClientEdit) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEdit((p) => ({ ...p, [key]: e.target.value }));

  const handleSave = () => {
    const client = isRecord(donneesExtraites.client) ? donneesExtraites.client : {};
    const next: Record<string, unknown> = {
      ...donneesExtraites,
      client: {
        ...client,
        raison_sociale: edit.raison_sociale,
        nom: edit.nom,
        prenom: edit.prenom,
        fonction: edit.fonction,
        email: edit.email,
        mobile: edit.mobile,
        fixe: edit.fixe,
        adresse: edit.adresse,
        code_postal: edit.code_postal,
        ville: edit.ville,
        siret: edit.siret,
      },
    };
    onSave(next);
    onClose();
  };

  const inputClass = 'h-8 text-sm border border-gray-300 rounded px-2 w-full';
  const labelClass = 'text-[11px] font-medium text-gray-500 mb-0.5 block';

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
          <User className="w-4 h-4 text-green-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-800">Coordonnées client</p>
            <p className="text-[11px] text-green-600">Issues de la SA — modifiables</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-green-500 hover:bg-green-100 hover:text-green-700 transition-colors"
          aria-label="Fermer les coordonnées client"
          title="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-[calc(100%-45px)] overflow-auto p-3 bg-green-50/30 flex flex-col">
        <div className="space-y-2.5 flex-1">
          <div>
            <label className={labelClass}>Raison sociale</label>
            <input value={edit.raison_sociale} onChange={setField('raison_sociale')} className={inputClass} placeholder="Société" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Nom</label>
              <input value={edit.nom} onChange={setField('nom')} className={inputClass} placeholder="Nom" />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Prénom</label>
              <input value={edit.prenom} onChange={setField('prenom')} className={inputClass} placeholder="Prénom" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Fonction</label>
            <input value={edit.fonction} onChange={setField('fonction')} className={inputClass} placeholder="Fonction" />
          </div>
          <div>
            <label className={labelClass}>E-mail</label>
            <input value={edit.email} onChange={setField('email')} className={inputClass} placeholder="Adresse e-mail" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Ligne mobile</label>
              <input value={edit.mobile} onChange={setField('mobile')} className={inputClass} placeholder="Mobile" />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Ligne fixe</label>
              <input value={edit.fixe} onChange={setField('fixe')} className={inputClass} placeholder="Fixe" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Adresse</label>
            <input value={edit.adresse} onChange={setField('adresse')} className={inputClass} placeholder="Adresse (rue, numéro)" />
          </div>
          <div className="flex gap-2">
            <div className="w-28">
              <label className={labelClass}>Code postal</label>
              <input value={edit.code_postal} onChange={setField('code_postal')} className={inputClass} placeholder="C.P." />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Ville</label>
              <input value={edit.ville} onChange={setField('ville')} className={inputClass} placeholder="Ville" />
            </div>
          </div>
          <div>
            <label className={labelClass}>SIRET</label>
            <input value={edit.siret} onChange={setField('siret')} className={inputClass} placeholder="Numéro de SIRET" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 mt-1 border-t border-green-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Redimensionner la fenêtre"
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
