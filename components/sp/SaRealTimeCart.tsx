'use client';

import { useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronUp, Pencil, Trash2, Plus, Check, X, RotateCcw } from 'lucide-react';
import { calculateSaCartSummary, type SaCartLine } from '@/lib/sp/calculateSaCart';
import {
  applySaEdit,
  getSaEditableLines,
  type SaAddInput,
  type SaEditableLine,
  type SaLigneType,
  type SaSection,
} from '@/lib/sp/saCartEdit';
import { formatEuro } from '@/lib/sp/calculLoyer';

interface SaRealTimeCartProps {
  donneesExtraites?: Record<string, unknown>;
  /** Total mensuel SP pour afficher l'économie (optionnel). */
  spTotalMensuel?: number;
  /**
   * Callback de mise à jour de `situation_actuelle` après une édition du panier.
   * Sa présence active le mode édition (ajout / modification / suppression).
   */
  onUpdateSaData?: (situationActuelle: Record<string, unknown>) => void;
  /** Réinitialise le panier SA à son état d'origine (avant modifications). */
  onResetSaData?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function Line({
  label,
  value,
  bold,
  muted,
  suffix = '/mois',
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  suffix?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between text-xs ${
        bold ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {formatEuro(value)}
        <span className="ml-0.5 text-[10px] text-gray-400">{suffix}</span>
      </span>
    </div>
  );
}

interface CategoryAccordionProps {
  label: string;
  total: number;
  lines: SaCartLine[];
  expanded: boolean;
  onToggle: () => void;
}

function CategoryAccordion({ label, total, lines, expanded, onToggle }: CategoryAccordionProps) {
  if (total <= 0) return null;
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-xs text-gray-700 hover:text-gray-900"
      >
        <span className="flex items-center gap-1">
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          {label}
        </span>
        <span className="tabular-nums">
          {formatEuro(total)}
          <span className="ml-0.5 text-[10px] text-gray-400">/mois</span>
        </span>
      </button>
      {expanded && (
        <div className="ml-3 space-y-0.5">
          {lines.map((l, i) => (
            <div
              key={`${l.libelle}-${i}`}
              className="flex items-start justify-between gap-2 text-[11px] text-gray-600 border-l-2 border-amber-100 pl-2"
            >
              <span className="truncate" title={l.libelle}>
                {l.libelle}
                {l.operateur && (
                  <span className="ml-1 text-[10px] text-gray-400">({l.operateur})</span>
                )}
              </span>
              <span className="tabular-nums shrink-0">{formatEuro(l.montant)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Édition ──────────────────────────────────────────────────────────

function NumField({
  label,
  value,
  onChange,
  step = 0.01,
  min = 0,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[11px] text-amber-900 tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[11px] text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
    </label>
  );
}

interface LineDraft {
  designation: string;
  numero: string;
  quantite: string;
  montant: string;
}

function EditableLineRow({
  line,
  onUpdate,
  onDelete,
}: {
  line: SaEditableLine;
  onUpdate: (patch: { designation: string; numero: string; quantite: number; montant: number }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LineDraft>({
    designation: line.designation,
    numero: line.numero,
    quantite: String(line.quantite),
    montant: String(line.montant),
  });

  const open = () => {
    setDraft({
      designation: line.designation,
      numero: line.numero,
      quantite: String(line.quantite),
      montant: String(line.montant),
    });
    setEditing(true);
  };

  const save = () => {
    onUpdate({
      designation: draft.designation.trim() || line.designation,
      numero: draft.numero.trim(),
      quantite: Math.max(1, Math.round(Number(draft.quantite)) || 1),
      montant: Math.max(0, Number(draft.montant)) || 0,
    });
    setEditing(false);
  };

  return (
    <div className="border-l-2 border-amber-100 pl-2 py-0.5">
      <div className="flex items-start justify-between gap-2 text-[11px] text-gray-600">
        <span className="truncate" title={line.designation}>
          {line.designation}
          {line.numero && <span className="ml-1 text-[10px] text-gray-400">({line.numero})</span>}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="tabular-nums">{formatEuro(line.montant)}</span>
          <button
            type="button"
            onClick={open}
            title="Modifier"
            className={`rounded p-0.5 transition-colors hover:bg-amber-50 ${editing ? 'text-amber-600' : 'text-gray-300 hover:text-gray-500'}`}
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Supprimer"
            className="rounded p-0.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-1 flex flex-col gap-1 border-l-2 border-amber-200 pl-2">
          <TextField label="Désignation" value={draft.designation} onChange={(v) => setDraft((d) => ({ ...d, designation: v }))} />
          <TextField label="Numéro" value={draft.numero} onChange={(v) => setDraft((d) => ({ ...d, numero: v }))} />
          <NumField label="Quantité" value={draft.quantite} step={1} min={1} onChange={(v) => setDraft((d) => ({ ...d, quantite: v }))} />
          <NumField label="Prix mensuel HT" value={draft.montant} onChange={(v) => setDraft((d) => ({ ...d, montant: v }))} />
          <div className="flex items-center justify-end gap-1 pt-0.5">
            <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100">
              <X className="w-3 h-3" /> Annuler
            </button>
            <button type="button" onClick={save} className="flex items-center gap-1 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-amber-700">
              <Check className="w-3 h-3" /> Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddLineForm({
  section,
  onAdd,
  onCancel,
}: {
  section: SaSection;
  onAdd: (input: SaAddInput) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<SaLigneType>('mobile');
  const [draft, setDraft] = useState<LineDraft>({ designation: '', numero: '', quantite: '1', montant: '' });

  const submit = () => {
    const montant = Math.max(0, Number(draft.montant)) || 0;
    if (!draft.designation.trim() && montant <= 0) {
      onCancel();
      return;
    }
    onAdd({
      section,
      type: section === 'abonnement' ? type : undefined,
      designation: draft.designation.trim() || (section === 'location' ? 'Location' : 'Abonnement'),
      numero: draft.numero.trim() || undefined,
      quantite: Math.max(1, Math.round(Number(draft.quantite)) || 1),
      montant,
    });
  };

  return (
    <div className="mt-1 flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
      {section === 'abonnement' && (
        <label className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
          <span>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SaLigneType)}
            className="w-32 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[11px] text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            <option value="fixe">Fixe</option>
            <option value="mobile">Mobile</option>
            <option value="internet">Internet</option>
          </select>
        </label>
      )}
      <TextField label="Désignation" value={draft.designation} onChange={(v) => setDraft((d) => ({ ...d, designation: v }))} placeholder="ex : Forfait Pro" />
      <TextField label="Numéro" value={draft.numero} onChange={(v) => setDraft((d) => ({ ...d, numero: v }))} placeholder="optionnel" />
      <NumField label="Quantité" value={draft.quantite} step={1} min={1} onChange={(v) => setDraft((d) => ({ ...d, quantite: v }))} />
      <NumField label="Prix mensuel HT" value={draft.montant} onChange={(v) => setDraft((d) => ({ ...d, montant: v }))} />
      <div className="flex items-center justify-end gap-1 pt-0.5">
        <button type="button" onClick={onCancel} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100">
          <X className="w-3 h-3" /> Annuler
        </button>
        <button type="button" onClick={submit} className="flex items-center gap-1 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-amber-700">
          <Check className="w-3 h-3" /> Ajouter
        </button>
      </div>
    </div>
  );
}

function EditableSaBody({
  sa,
  lines,
  abonnementsTotal,
  locationsTotal,
  onUpdateSaData,
  onResetSaData,
}: {
  sa: Record<string, unknown>;
  lines: SaEditableLine[];
  abonnementsTotal: number;
  locationsTotal: number;
  onUpdateSaData: (situationActuelle: Record<string, unknown>) => void;
  onResetSaData?: () => void;
}) {
  const [adding, setAdding] = useState<SaSection | null>(null);
  // Sections repliées par défaut ; on déplie pour voir/éditer le détail.
  const [expanded, setExpanded] = useState<Set<SaSection>>(new Set());
  const [confirmReset, setConfirmReset] = useState(false);

  const apply = (op: Parameters<typeof applySaEdit>[1]) => onUpdateSaData(applySaEdit(sa, op));

  const toggle = (section: SaSection) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });

  const renderSection = (section: SaSection, label: string, total: number) => {
    const sectionLines = lines.filter((l) => l.section === section);
    const isOpen = expanded.has(section);
    return (
      <section className="space-y-1">
        <button
          type="button"
          onClick={() => toggle(section)}
          className="w-full flex items-center justify-between text-xs text-gray-700 hover:text-gray-900"
        >
          <span className="flex items-center gap-1 font-medium">
            <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
            {label}
          </span>
          <span className="tabular-nums">
            {formatEuro(total)}
            <span className="ml-0.5 text-[10px] text-gray-400">/mois</span>
          </span>
        </button>

        {isOpen && (
          <div className="ml-3 space-y-1">
            {sectionLines.map((line) => (
              <EditableLineRow
                key={line.id}
                line={line}
                onUpdate={(patch) => apply({ kind: 'update', id: line.id, patch })}
                onDelete={() => apply({ kind: 'delete', id: line.id })}
              />
            ))}
            {adding === section ? (
              <AddLineForm
                section={section}
                onAdd={(input) => {
                  apply({ kind: 'add', input });
                  setAdding(null);
                }}
                onCancel={() => setAdding(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(section)}
                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-amber-700 hover:bg-amber-50"
              >
                <Plus className="w-3 h-3" /> Ajouter {section === 'location' ? 'une location' : 'un abonnement'}
              </button>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      {renderSection('abonnement', 'Abonnements', abonnementsTotal)}
      {renderSection('location', 'Locations matériel', locationsTotal)}

      {onResetSaData && (
        <div className="pt-1">
          {confirmReset ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5">
              <span className="text-[10px] text-red-700">Réinitialiser le panier SA&nbsp;?</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResetSaData();
                    setConfirmReset(false);
                    setAdding(null);
                    setExpanded(new Set());
                  }}
                  className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-700"
                >
                  <RotateCcw className="w-3 h-3" /> Confirmer
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600"
            >
              <RotateCcw className="w-3 h-3" /> Réinitialiser le panier SA
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function SaRealTimeCart({ donneesExtraites, spTotalMensuel, onUpdateSaData, onResetSaData }: SaRealTimeCartProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const summary = useMemo(() => calculateSaCartSummary(donneesExtraites), [donneesExtraites]);

  const editable = !!onUpdateSaData;
  const sa = useMemo<Record<string, unknown>>(() => {
    const root = isRecord(donneesExtraites) ? donneesExtraites : {};
    return isRecord(root.situation_actuelle) ? root.situation_actuelle : root;
  }, [donneesExtraites]);
  const editableLines = useMemo(
    () => (editable ? getSaEditableLines(sa) : []),
    [editable, sa],
  );

  const toggleCat = (key: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const grouped = useMemo(() => {
    const acc = {
      fixe: [] as SaCartLine[],
      mobile: [] as SaCartLine[],
      internet: [] as SaCartLine[],
      abonnement: [] as SaCartLine[],
      location: [] as SaCartLine[],
    };
    for (const l of summary.details) {
      if (l.categorie === 'fixe') acc.fixe.push(l);
      else if (l.categorie === 'mobile') acc.mobile.push(l);
      else if (l.categorie === 'internet') acc.internet.push(l);
      else if (l.categorie === 'location') acc.location.push(l);
      else acc.abonnement.push(l);
    }
    return acc;
  }, [summary.details]);

  if (!summary.hasData && !editable) return null;

  const economie =
    typeof spTotalMensuel === 'number' && spTotalMensuel > 0
      ? summary.totalMensuel - spTotalMensuel
      : null;

  return (
    <div
      className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-200 bg-white shadow-xl"
      role="complementary"
      aria-label="Panier situation actuelle"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-gradient-to-r from-amber-600 to-amber-500 px-3 py-2 text-white hover:from-amber-700 hover:to-amber-600 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Archive className="h-4 w-4" />
          Situation Actuelle
          {editable && (
            <span className="text-[10px] font-normal opacity-80 bg-white/20 px-1.5 py-0.5 rounded-full">
              édition
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums opacity-90">
            {formatEuro(summary.totalMensuel)}
            <span className="opacity-70">/mois</span>
          </span>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 py-3 space-y-2 max-h-[40vh] overflow-y-auto">
          {editable ? (
            <EditableSaBody
              sa={sa}
              lines={editableLines}
              abonnementsTotal={summary.abonnements}
              locationsTotal={summary.locations}
              onUpdateSaData={onUpdateSaData!}
              onResetSaData={onResetSaData}
            />
          ) : (
          <>
          {/* Section "Lignes" cachée lorsque le total provient des totaux officiels
              (les lignes sont déjà comprises dans les abonnements). */}
          {!summary.totalFromOfficiel &&
          (summary.lignesFixes > 0 || summary.lignesMobiles > 0 || summary.lignesInternet > 0) ? (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Lignes
              </p>
              <CategoryAccordion
                label="Fixe"
                total={summary.lignesFixes}
                lines={grouped.fixe}
                expanded={expandedCats.has('fixe')}
                onToggle={() => toggleCat('fixe')}
              />
              <CategoryAccordion
                label="Mobile"
                total={summary.lignesMobiles}
                lines={grouped.mobile}
                expanded={expandedCats.has('mobile')}
                onToggle={() => toggleCat('mobile')}
              />
              <CategoryAccordion
                label="Internet"
                total={summary.lignesInternet}
                lines={grouped.internet}
                expanded={expandedCats.has('internet')}
                onToggle={() => toggleCat('internet')}
              />
            </section>
          ) : null}

          {summary.abonnements > 0 && (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Abonnements
              </p>
              <CategoryAccordion
                label="Abonnements"
                total={summary.abonnements}
                lines={grouped.abonnement}
                expanded={expandedCats.has('abonnement')}
                onToggle={() => toggleCat('abonnement')}
              />
              {(grouped.fixe.length > 0 ||
                grouped.mobile.length > 0 ||
                grouped.internet.length > 0) && (
                <details className="ml-3">
                  <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 list-none flex items-center gap-1">
                    <ChevronDown className="h-3 w-3 -rotate-90" />
                    Détail par ligne (informatif)
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {[...grouped.fixe, ...grouped.mobile, ...grouped.internet].map((l, i) => (
                      <div
                        key={`${l.libelle}-${i}`}
                        className="flex items-start justify-between gap-2 text-[11px] text-gray-500 border-l-2 border-amber-100 pl-2"
                      >
                        <span className="truncate" title={l.libelle}>
                          {l.libelle}
                          {l.operateur && (
                            <span className="ml-1 text-[10px] text-gray-400">({l.operateur})</span>
                          )}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {l.montant.toFixed(2).replace('.', ',')} €
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {summary.locations > 0 && (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Locations matériel
              </p>
              <CategoryAccordion
                label="Locations"
                total={summary.locations}
                lines={grouped.location}
                expanded={expandedCats.has('location')}
                onToggle={() => toggleCat('location')}
              />
            </section>
          )}
          </>
          )}

          <div className="pt-1 border-t border-amber-100">
            <Line
              label={
                editable
                  ? 'Total mensuel SA'
                  : summary.totalFromOfficiel
                    ? 'Total mensuel SA (extrait)'
                    : 'Total mensuel SA'
              }
              value={summary.totalMensuel}
              bold
            />
            {economie !== null && (
              <div
                className={`flex items-center justify-between text-xs pt-1 ${
                  economie > 0 ? 'text-emerald-700' : economie < 0 ? 'text-red-700' : 'text-gray-500'
                }`}
              >
                <span className="font-medium">
                  {economie > 0
                    ? 'Économie loyer SP vs SA'
                    : economie < 0
                      ? 'Surcoût loyer SP vs SA'
                      : 'Égal'}
                </span>
                <span className="tabular-nums font-semibold">
                  {formatEuro(Math.abs(economie))}
                  <span className="ml-0.5 text-[10px] opacity-70">/mois</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
