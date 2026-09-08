import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileText,
  Calendar,
  Clock,
  Package,
  Edit3,
  ChevronDown,
  Sparkles,
  ClipboardList,
  Gift,
  TrendingDown,
  MapPin,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { friendlyFileNameFromUrl } from '@/lib/utils/storage-filename';
import { SuggestionsPanel } from '@/components/propositions/PropositionDetailClient';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { PropositionRowMenu } from '@/components/propositions/PropositionRowMenu';
import { PropositionStatusBadge } from '@/components/propositions/PropositionStatusBadge';
import { StatutCommercialSelect } from '@/components/propositions/StatutCommercialSelect';
import { ExportSaSpButtons } from '@/components/propositions/ExportSaSpButtons';
import { SaResumeRenderer } from '@/components/propositions/SaResumeRenderer';
import type {
  CatalogueProduit,
  OrganizationPreferences,
  SpConfigLoyer,
  SpObjectifConfig,
  SpPreferencesProduits,
  SpQuestion,
  SpQuestionReponse,
  SuggestionsSpCompletes,
} from '@/types';
import { calculateCartSummary, resolveIndemnites, type SpCartSummary } from '@/lib/sp/calculateCart';
import { calculateSaCartSummary } from '@/lib/sp/calculateSaCart';
import { evaluateObjectifsForRender } from '@/lib/sp/evaluateObjectifs';
import SpObjectifsAccomplis from '@/components/sp/SpObjectifsAccomplis';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { scopePropositionsQuery } from '@/lib/propositions/visibility';
import { resolvePropositionClientName } from '@/lib/propositions/clientName';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasSuggestionsGenerees(
  value: unknown
): value is { suggestions: unknown[]; synthese: Record<string, unknown> } {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.suggestions)) return false;
  if (!isRecord(value.synthese)) return false;
  return true;
}

function hasSuggestionsSpCompletes(value: unknown): value is SuggestionsSpCompletes {
  if (!isRecord(value)) return false;
  return Array.isArray(value.sp_lignes_mobiles)
    || Array.isArray(value.sp_lignes_fixes)
    || Array.isArray(value.sp_internet)
    || Array.isArray(value.sp_materiel)
    || Array.isArray(value.sp_materiel_detail);
}

function formatSpValue(value: SpQuestionReponse['valeur']): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([key, v]) => `${formatFieldName(key)} : ${String(v)}`)
      .join(' · ');
  }
  if (!value) return '-';
  const text = String(value);
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(', ');
      if (isRecord(parsed)) {
        return Object.entries(parsed)
          .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '0' && v !== 0)
          .map(([key, v]) => `${key} : ${String(v)}`)
          .join(' · ') || '-';
      }
    } catch {
      return text;
    }
  }
  return text;
}

function compactRows<T>(rows: T[] | undefined | null): T[] {
  return Array.isArray(rows) ? rows : [];
}

function parseEuroValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatEuroValue(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function rowPrice(row: Record<string, unknown>): number {
  return parseEuroValue(row._prix_raw ?? row._prix_propose_raw ?? row._prix_mensuel_raw ?? row.sp_prix_propose ?? row.sp_matd_prix_ht ?? row.sp_materiel_prix_mensuel);
}

function hasPositiveValue(val: string | undefined | null): boolean {
  if (!val) return false;
  return parseEuroValue(val) > 0;
}

function isTechnicalSpResponse(reponse: SpQuestionReponse, questionsById: Map<string, SpQuestion>): boolean {
  const id = reponse.question_id.toLowerCase();
  if (!questionsById.has(reponse.question_id)) return true;
  if (id.startsWith('fas_') || id.startsWith('prix_') || id.startsWith('quantite_') || id.startsWith('libre_')) return true;
  if (id.startsWith('sp_prix_override_') || id.includes('_prix_override_')) return true;
  return false;
}

function SpResumePanel({
  sp,
  reponses,
  questions,
  indemnitesResolues,
  cart,
  saTotalMensuel,
}: {
  sp: SuggestionsSpCompletes | null;
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  indemnitesResolues: string | null;
  cart: SpCartSummary | null;
  saTotalMensuel: number;
}) {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const mobiles = compactRows(sp?.sp_lignes_mobiles);
  const fixes = compactRows(sp?.sp_lignes_fixes);
  const internet = compactRows(sp?.sp_internet);
  const materielDetail = compactRows(sp?.sp_materiel_detail).map((row) => row as unknown as Record<string, unknown>);
  const materielBase = compactRows(sp?.sp_materiel).map((row) => row as unknown as Record<string, unknown>);
  const materiel = materielDetail.length > 0 ? materielDetail : materielBase;
  const cadeaux = compactRows(sp?.sp_cadeaux_table);
  const questionResponses = reponses.filter((reponse) => !isTechnicalSpResponse(reponse, questionsById));
  const mobileRows = mobiles.map((row) => row as unknown as Record<string, unknown>);
  const fixeRows = fixes.map((row) => row as unknown as Record<string, unknown>);
  const internetRows = internet.map((row) => row as unknown as Record<string, unknown>);
  const recurrentTotal = [...mobileRows, ...fixeRows, ...internetRows].reduce((sum, row) => sum + rowPrice(row), 0);
  const materielTotal = materiel.reduce((sum, row) => sum + rowPrice(row), 0);
  const hasLines = mobiles.length > 0 || fixes.length > 0 || internet.length > 0 || materiel.length > 0;

  // FAS : le champ réellement stocké est sp_fas_total (pas sp_total_fas)
  const fasValue = (sp as unknown as Record<string, unknown>)?.sp_fas_total as string | undefined ?? sp?.sp_total_fas ?? sp?.sp_total_installation;

  // Indemnités : valeur résolue côté serveur (même logique que le comparatif SA/SP)
  const indemnitesValue = indemnitesResolues;
  const adresseFactu = sp?.sp_adresse_facturation;
  const adresseLivr = sp?.sp_adresse_livraison;
  const showAdresses = !!(sp?.sp_fournisseur_propose || adresseFactu);

  // ── Totaux du panier ──────────────────────────────────────────────
  // Le panier recalculé côté serveur (cart) est la source de vérité : mêmes chiffres
  // que le widget "Situation Proposée", avec matériel / installation / FAS séparés.
  // Repli sur les données figées à la génération pour les anciennes propositions
  // sans sp_reponses enregistrées.
  const abosFixe = cart ? cart.abonnements.fixe : fixeRows.reduce((sum, row) => sum + rowPrice(row), 0);
  const abosMobile = cart ? cart.abonnements.mobile : mobileRows.reduce((sum, row) => sum + rowPrice(row), 0);
  const abosInternet = cart ? cart.abonnements.internet : internetRows.reduce((sum, row) => sum + rowPrice(row), 0);
  const abosTotal = cart ? cart.abonnements.totalMensuel : recurrentTotal;

  const materielTotalFinal = cart ? cart.materiel : materielTotal;
  const installationsTotal = cart ? cart.installations : 0;
  const fasTotalFinal = cart ? cart.fas : parseEuroValue(fasValue);
  const cadeauxTotalFinal = cart ? cart.cadeaux : cadeaux.reduce((sum, c) => sum + (c._valeur_raw || 0), 0);
  const indemnitesTotalFinal = cart ? cart.indemnites : (indemnitesValue ? parseEuroValue(indemnitesValue) : 0);
  const remiseMoisOffertFinal = cart ? cart.remiseMoisOffert : parseEuroValue(sp?.sp_remise_mois_offert);

  const totalMensuelFinal = cart
    ? (cart.loyer?.loyer_mensuel ?? cart.abonnements.totalMensuel)
    : (parseEuroValue(sp?.sp_loyer_mensuel) > 0 ? parseEuroValue(sp?.sp_loyer_mensuel) : abosTotal);

  const showFas = fasTotalFinal > 0;
  const showInstallations = installationsTotal > 0;
  const showCadeaux = cadeauxTotalFinal > 0 || cadeaux.length > 0;
  const showIndemnites = indemnitesTotalFinal > 0;
  const showRemiseMoisOffert = remiseMoisOffertFinal > 0;

  // Économie = SA total mensuel - SP total mensuel (loyer), même calcul que le
  // badge "Économie loyer SP vs SA" du panier temps réel.
  const economieMensuelle = saTotalMensuel > 0 ? saTotalMensuel - totalMensuelFinal : null;

  return (
    <div className="space-y-5">

      {/* ── Hero section ── */}
      {sp && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Gauche — montant principal */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Total mensuel proposé</p>
              <p className="text-5xl font-extrabold text-slate-900 leading-none">
                {totalMensuelFinal > 0
                  ? formatEuroValue(totalMensuelFinal)
                  : sp.sp_total_recurrent || sp.sp_total_propose || '-'}
              </p>

              {/* Durée engagement */}
              {sp.sp_duree_mois && (
                <p className="text-sm text-slate-500 mt-3">
                  Engagement <strong className="text-slate-700">{sp.sp_duree_mois} mois</strong>
                  {sp.sp_mois_offerts ? ` · ${sp.sp_mois_offerts} mois offerts` : ''}
                  {sp.sp_duree_trimestres ? ` (${sp.sp_duree_trimestres} trimestres)` : ''}
                </p>
              )}

              {/* Badge économie */}
              {economieMensuelle !== null && economieMensuelle !== 0 && (
                <div
                  className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                    economieMensuelle > 0
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <TrendingDown className={`w-4 h-4 ${economieMensuelle > 0 ? 'text-emerald-600' : 'text-red-600 rotate-180'}`} />
                  <span className={`text-sm font-semibold ${economieMensuelle > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {economieMensuelle > 0 ? 'Économie' : 'Surcoût'} {formatEuroValue(Math.abs(economieMensuelle))}/mois
                    {' · '}{formatEuroValue(Math.abs(economieMensuelle) * 12)}/an
                  </span>
                </div>
              )}
            </div>

            {/* Droite — synthèse détaillée */}
            <div className="flex flex-col gap-2.5 justify-center">
              <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Abonnements</span>
                <span className="font-semibold text-slate-900">{formatEuroValue(abosTotal)}</span>
              </div>
              {abosFixe > 0 && (
                <div className="flex items-center justify-between text-xs pl-3 -mt-1.5">
                  <span className="text-slate-500">Fixe</span>
                  <span className="text-slate-600">{formatEuroValue(abosFixe)}</span>
                </div>
              )}
              {abosMobile > 0 && (
                <div className="flex items-center justify-between text-xs pl-3 -mt-1.5">
                  <span className="text-slate-500">Mobile</span>
                  <span className="text-slate-600">{formatEuroValue(abosMobile)}</span>
                </div>
              )}
              {abosInternet > 0 && (
                <div className="flex items-center justify-between text-xs pl-3 -mt-1.5 pb-0.5">
                  <span className="text-slate-500">Internet</span>
                  <span className="text-slate-600">{formatEuroValue(abosInternet)}</span>
                </div>
              )}

              {materielTotalFinal > 0 && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                  <span className="text-slate-600">Matériel</span>
                  <span className="font-semibold text-slate-900">{formatEuroValue(materielTotalFinal)}</span>
                </div>
              )}

              {showInstallations && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Installation
                  </span>
                  <span className="font-semibold text-slate-900">{formatEuroValue(installationsTotal)}</span>
                </div>
              )}

              {showFas && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    {showInstallations ? 'FAS' : 'FAS / Installation'}
                  </span>
                  <span className="font-semibold text-slate-900">{formatEuroValue(fasTotalFinal)}</span>
                </div>
              )}

              {showCadeaux && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5" />
                    Cadeaux / avantages
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {cadeauxTotalFinal > 0 ? formatEuroValue(cadeauxTotalFinal) : (sp?.sp_total_cadeaux_ht || `${cadeaux.length} cadeau${cadeaux.length > 1 ? 'x' : ''}`)}
                  </span>
                </div>
              )}

              {showRemiseMoisOffert && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
                  <span className="text-slate-600">Remise mois offerts</span>
                  <span className="font-semibold text-emerald-700">{formatEuroValue(remiseMoisOffertFinal)}</span>
                </div>
              )}

              {showIndemnites && (
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-slate-600">Indemnités résiliation</span>
                  <span className="font-semibold text-red-600">{formatEuroValue(indemnitesTotalFinal)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Grille produits + FAS + Cadeaux ── */}
      {(hasLines || showFas || cadeaux.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Mobiles */}
          {mobileRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">Mobiles ({mobileRows.length})</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {mobileRows.map((row, index) => (
                  <div key={index} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{String(row.sp_produit ?? row.sp_nom_ligne ?? '-')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!!row.sp_produit_fournisseur && (
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">{String(row.sp_produit_fournisseur)}</span>
                        )}
                        <span className="text-xs text-slate-500">Qté : {String(row.sp_quantite ?? '1')}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">{String(row.sp_prix_propose ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fixes */}
          {fixeRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">Fixes ({fixeRows.length})</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {fixeRows.map((row, index) => (
                  <div key={index} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{String(row.sp_produit ?? row.sp_nom_ligne ?? '-')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!!row.sp_produit_fournisseur && (
                          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">{String(row.sp_produit_fournisseur)}</span>
                        )}
                        <span className="text-xs text-slate-500">Qté : {String(row.sp_quantite ?? '1')}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">{String(row.sp_prix_propose ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internet */}
          {internetRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">Internet ({internetRows.length})</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {internetRows.map((row, index) => (
                  <div key={index} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{String(row.sp_produit ?? row.sp_nom_ligne ?? '-')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!!row.sp_produit_fournisseur && (
                          <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-medium">{String(row.sp_produit_fournisseur)}</span>
                        )}
                        <span className="text-xs text-slate-500">Qté : {String(row.sp_quantite ?? '1')}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">{String(row.sp_prix_propose ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matériel */}
          {materiel.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">Matériel ({materiel.length})</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {materiel.map((row, index) => {
                  const nom = String(row.sp_matd_nom ?? row.sp_materiel_nom ?? '-');
                  const ref = row.sp_matd_ref ? String(row.sp_matd_ref) : null;
                  const desc = row.sp_matd_description ? String(row.sp_matd_description) : null;
                  const freq = row.sp_matd_frequence ? String(row.sp_matd_frequence) : null;
                  const img = row.sp_matd_image_url ?? row.sp_mat_image_url;
                  const qty = String(row.sp_matd_quantite ?? row.sp_quantite ?? '1');
                  const prix = String(row.sp_matd_prix_ht ?? row.sp_materiel_prix_mensuel ?? '-');
                  const fournisseur = row.sp_matd_fournisseur ?? row.sp_materiel_fournisseur;
                  return (
                    <div key={index} className="px-4 py-3 flex items-start gap-3">
                      {!!img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={String(img)} alt={nom} className="w-10 h-10 rounded-lg object-contain border border-slate-100 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{nom}</p>
                            {ref && <p className="text-xs text-slate-400 mt-0.5">Réf. {ref}</p>}
                            {desc && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{desc}</p>}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {!!fournisseur && (
                                <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full font-medium">{String(fournisseur)}</span>
                              )}
                              {freq && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${freq === 'Achat unique' ? 'bg-slate-100 text-slate-600' : 'bg-purple-50 text-purple-700'}`}>
                                  {freq}
                                </span>
                              )}
                              <span className="text-xs text-slate-500">Qté : {qty}</span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 whitespace-nowrap shrink-0">{prix}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FAS / Installation */}
          {showFas && sp && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-slate-900">FAS</h3>
              </div>
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-slate-600">Frais d&apos;accès au service</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">ponctuel</span>
                  <span className="font-semibold text-slate-900">{fasValue}</span>
                </div>
              </div>
            </div>
          )}

          {/* Cadeaux / avantages */}
          {cadeaux.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-slate-500" />
                  Cadeaux / avantages ({cadeaux.length})
                </h3>
                {sp?.sp_total_cadeaux_ht && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{sp.sp_total_cadeaux_ht}</span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {cadeaux.map((cadeau, index) => (
                  <div key={index} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-slate-900">{cadeau.sp_cadeau_nom}</span>
                    <span className="text-slate-600 whitespace-nowrap">{cadeau.sp_cadeau_valeur_ht}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Indemnités & remises ── */}
      {showIndemnites && sp && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900 text-sm">Indemnités &amp; remises</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {indemnitesValue && (
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-slate-600">Indemnités de résiliation</span>
                <span className="font-semibold text-red-600">{indemnitesValue}</span>
              </div>
            )}
            {hasPositiveValue(sp.sp_remise_mois_offert) && (
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-slate-600">Remise mois offerts{sp.sp_mois_offerts ? ` (${sp.sp_mois_offerts} mois)` : ''}</span>
                <span className="font-semibold text-emerald-700">-{sp.sp_remise_mois_offert}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fournisseur & adresses ── */}
      {showAdresses && sp && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900 text-sm">Client &amp; adresses</h3>
          </div>
          <div className="p-4 space-y-4">
            {sp.sp_fournisseur_propose && (
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Fournisseur proposé</p>
                <p className="text-sm font-semibold text-slate-900">{sp.sp_fournisseur_propose}</p>
              </div>
            )}
            {adresseFactu && (
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Adresse de facturation</p>
                <p className="text-sm text-slate-800">
                  {[
                    adresseFactu.societe,
                    adresseFactu.adresse,
                    [adresseFactu.code_postal, adresseFactu.ville].filter(Boolean).join(' '),
                  ].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
            {adresseLivr && sp.sp_livraison_identique === false && (
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">Adresse de livraison</p>
                <p className="text-sm text-slate-800">
                  {[
                    adresseLivr.societe,
                    adresseLivr.adresse,
                    [adresseLivr.code_postal, adresseLivr.ville].filter(Boolean).join(' '),
                  ].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Questionnaire SP ── */}
      {questionResponses.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Réponses au questionnaire SP ({questionResponses.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {questionResponses.map((reponse, index) => {
              const question = questionsById.get(reponse.question_id);
              return (
                <div key={`${reponse.question_id}-${index}`} className="p-4">
                  <p className="text-sm font-semibold text-slate-900">{question?.libelle || formatFieldName(reponse.question_id)}</p>
                  <p className="text-sm text-slate-600 mt-1">{formatSpValue(reponse.valeur)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!sp && reponses.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm">
          Aucune donnée SP sauvegardée pour cette proposition.
        </div>
      )}
    </div>
  );
}
// Compte le nombre total de champs (récursivement)
function countTotalFields(data: unknown): number {
  if (data === null || data === undefined) return 0;
  if (typeof data !== 'object') return 1;
  if (Array.isArray(data)) return data.length;
  
  let count = 0;
  
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    
    if (Array.isArray(value)) {
      count += value.length;
    } else if (typeof value === 'object') {
      count += Object.keys(value as Record<string, unknown>).length;
    } else {
      count += 1;
    }
  }
  
  return count;
}

// Formate un nom de champ
function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

// Extrait le nom du document depuis l'URL de stockage (retire le préfixe UUID).
function extractDocumentName(url: string): string {
  return friendlyFileNameFromUrl(url);
}

// Extrait l'extension du fichier
function getFileExtension(url: string): string {
  try {
    const name = extractDocumentName(url);
    const ext = name.split('.').pop()?.toUpperCase();
    return ext || 'FILE';
  } catch {
    return 'FILE';
  }
}

function ObjectifsSection({
  objectifsConfig,
  templateId,
  reponses,
  sp,
}: {
  objectifsConfig: SpObjectifConfig[];
  templateId: string;
  reponses: SpQuestionReponse[];
  sp: SuggestionsSpCompletes | null;
}) {
  if (!objectifsConfig.length || !templateId) return null;
  const resolved = evaluateObjectifsForRender(objectifsConfig, templateId, reponses, sp);
  if (resolved.length === 0) return null;
  return <SpObjectifsAccomplis resolvedObjectifs={resolved} />;
}

export default async function PropositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) {
    redirect('/login');
  }

  const canDownloadProposition = ctx.role === 'owner' || ctx.permissions.download_proposition;
  const canDownloadComparatifSaSp = ctx.role === 'owner' || ctx.permissions.download_comparatif_sa_sp;

  // Récupérer la proposition avec le template
  const { data: proposition, error } = await scopePropositionsQuery(
    supabase
      .from('propositions')
      .select(`
        *,
        template:proposition_templates(*)
      `)
      .eq('id', id),
    ctx
  ).single();

  if (error || !proposition) {
    console.error('Erreur récupération proposition:', error);
    notFound();
  }

  const templateRaw = (proposition as Record<string, unknown>).template;
  const template = isRecord(templateRaw) ? templateRaw : null;
  
  const extractedDataRaw = proposition.extracted_data || proposition.donnees_extraites || {};
  const extractedDataRecord: Record<string, unknown> = isRecord(extractedDataRaw) ? extractedDataRaw : {};
  const normalizeKey = (k: string) =>
    k
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  const resumeKey = Object.keys(extractedDataRecord).find((k) => normalizeKey(k) === 'resume');
  const resume =
    resumeKey && typeof extractedDataRecord[resumeKey] === 'string'
      ? (extractedDataRecord[resumeKey] as string)
      : '';
  const extractedDataForDisplay: Record<string, unknown> =
    resumeKey
      ? Object.fromEntries(Object.entries(extractedDataRecord).filter(([k]) => normalizeKey(k) !== 'resume'))
      : extractedDataRecord;
  const clientName = resolvePropositionClientName(
    extractedDataRecord,
    proposition.nom_client,
    'Proposition sans nom',
  );
  
  const documentsUrls = proposition.source_documents || proposition.documents_urls || proposition.documents_sources_urls || [];
  const totalFields = countTotalFields(extractedDataForDisplay);
  const suggestionsGenerees =
    (proposition as Record<string, unknown>).suggestions_editees ||
    (proposition as Record<string, unknown>).suggestions_generees;
  const suggestionsSpCompletesRaw = (proposition as Record<string, unknown>).suggestions_sp_completes;
  const suggestionsSpCompletes = hasSuggestionsSpCompletes(suggestionsSpCompletesRaw) ? suggestionsSpCompletesRaw : null;
  const spReponses = Array.isArray((proposition as Record<string, unknown>).sp_reponses)
    ? (proposition as Record<string, unknown>).sp_reponses as SpQuestionReponse[]
    : [];
  const { data: organization } = await supabase
    .from('organizations')
    .select('sp_questions, preferences')
    .eq('id', ctx.organizationId)
    .single();
  const allSpQuestions = Array.isArray(organization?.sp_questions) ? organization.sp_questions as SpQuestion[] : [];
  const templateId = typeof proposition.template_id === 'string' ? proposition.template_id : undefined;
  const spQuestions = templateId
    ? allSpQuestions.filter((question) => question.template_id === templateId)
    : allSpQuestions;

  const spObjectifsConfig = Array.isArray((organization?.preferences as Record<string, unknown>)?.sp_objectifs_config)
    ? (organization!.preferences as Record<string, unknown>).sp_objectifs_config as import('@/types').SpObjectifConfig[]
    : [];

  // Résolution des indemnités identique au tableau comparatif SA/SP
  const donneesExtraitesForCalc: Record<string, unknown> =
    isRecord((proposition as Record<string, unknown>).filled_data)
      ? (proposition as Record<string, unknown>).filled_data as Record<string, unknown>
      : extractedDataRecord;
  const indemnitesResolues = resolveIndemnites(spReponses, spQuestions, donneesExtraitesForCalc);
  const indemnitesResoluesStr = indemnitesResolues > 0 ? formatEuroValue(indemnitesResolues) : null;
  const saTotalMensuel = calculateSaCartSummary(donneesExtraitesForCalc).totalMensuel;

  // Panier SP recalculé en temps réel (même logique que le widget "Situation Proposée"
  // et l'export comparatif) : seule source qui distingue vraiment matériel / installation / FAS.
  let spCart: SpCartSummary | null = null;
  if (spReponses.length > 0) {
    const { data: catalogueRows } = await supabase
      .from('catalogues_produits')
      .select('*')
      .eq('actif', true)
      .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`);
    const catalogue: CatalogueProduit[] = Array.isArray(catalogueRows) ? (catalogueRows as CatalogueProduit[]) : [];

    const prefs = (isRecord(organization?.preferences) ? organization.preferences : {}) as OrganizationPreferences;
    const templateFileCfg = isRecord(template?.file_config) ? (template.file_config as Record<string, unknown>) : {};
    const spConfigLoyer: SpConfigLoyer | undefined = isRecord(prefs.sp_config_loyer)
      ? prefs.sp_config_loyer
      : isRecord(templateFileCfg.sp_config_loyer)
        ? (templateFileCfg.sp_config_loyer as unknown as SpConfigLoyer)
        : undefined;
    const spPreferencesProduits: SpPreferencesProduits | undefined = isRecord(templateFileCfg.sp_preferences_produits)
      ? (templateFileCfg.sp_preferences_produits as unknown as SpPreferencesProduits)
      : undefined;
    const spConfigMoisOfferts = isRecord(prefs.sp_config_mois_offerts) ? prefs.sp_config_mois_offerts : undefined;

    spCart = calculateCartSummary(spReponses, spQuestions, catalogue, donneesExtraitesForCalc, spConfigLoyer, spConfigMoisOfferts, spPreferencesProduits);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <Link
            href="/propositions"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux propositions
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg font-semibold text-slate-600">
                {clientName[0]?.toUpperCase() || 'C'}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-900">{clientName}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <PropositionStatusBadge statut={proposition.statut} />
                  {proposition.statut === 'exported' && (
                    <StatutCommercialSelect
                      propositionId={proposition.id}
                      value={proposition.statut_commercial}
                    />
                  )}
                  <span className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(proposition.created_at, 'long')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {typeof template?.nom === 'string' ? template.nom : 'Template N/A'}
                  {' · '}
                  {documentsUrls.length} document{documentsUrls.length > 1 ? 's' : ''}
                  {' · '}
                  {totalFields} champ{totalFields > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
              {['draft', 'ready', 'extracted'].includes(proposition.statut) && (
                <Link
                  href={`/propositions/${proposition.id}/resume`}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  <Edit3 className="h-4 w-4" />
                  Reprendre
                </Link>
              )}

              {canDownloadProposition &&
                ['ready', 'extracted'].includes(proposition.statut) &&
                !proposition.duplicated_template_url &&
                !proposition.fichier_genere_url && (
                  <GenerateButton propositionId={proposition.id} variant="primary" />
                )}

              {canDownloadProposition &&
                (proposition.duplicated_template_url || proposition.fichier_genere_url) && (
                <a
                  href={proposition.duplicated_template_url || proposition.fichier_genere_url}
                  download
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </a>
              )}

              {canDownloadComparatifSaSp && proposition.suggestions_sp_completes && (
                <ExportSaSpButtons propositionId={proposition.id} variant="outline" />
              )}

              <PropositionRowMenu
                propositionId={proposition.id}
                showOpenDetail={false}
                afterDeleteHref="/propositions"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {/* Timeline / Progress (si génération en cours) */}
        {proposition.statut === 'processing' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 animate-spin text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">Génération en cours…</h3>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-3/5 animate-pulse rounded-full bg-slate-900" />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Votre proposition est en cours de création. Cela peut prendre quelques instants.
            </p>
          </div>
        )}

        {/* Résumé SA */}
        {!!resume.trim() && (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Résumé SA</h2>
                  <p className="text-xs text-slate-500">
                    Synthèse automatique basée sur les documents sources
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-5">
              <SaResumeRenderer text={resume} donneesExtraites={donneesExtraitesForCalc} />
            </div>
          </details>
        )}

        {/* Suggestions IA */}
        {hasSuggestionsGenerees(suggestionsGenerees) && (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Suggestions IA</h2>
                  <p className="text-xs text-slate-500">
                    Comparatif calculé à partir des données de la proposition
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-5">
              <SuggestionsPanel
                propositionId={proposition.id}
                clientName={clientName}
                suggestions={suggestionsGenerees}
                embedded
              />
            </div>
          </details>
        )}

        {/* Résumé SP */}
        {(suggestionsSpCompletes || spReponses.length > 0) && (
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <ClipboardList className="h-4 w-4 text-slate-400" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Résumé SP</h2>
                  <p className="text-xs text-slate-500">
                    Synthèse de la situation proposée, du panier SP et des réponses au questionnaire
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 p-5">
              <SpResumePanel sp={suggestionsSpCompletes} reponses={spReponses} questions={spQuestions} indemnitesResolues={indemnitesResoluesStr} cart={spCart} saTotalMensuel={saTotalMensuel} />
              <ObjectifsSection
                objectifsConfig={spObjectifsConfig}
                templateId={templateId ?? ''}
                reponses={spReponses}
                sp={suggestionsSpCompletes}
              />
            </div>
          </details>
        )}

        {/* Documents sources */}
        {documentsUrls.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <Package className="h-4 w-4 text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Documents sources</h2>
                <p className="text-xs text-slate-500">
                  {documentsUrls.length} fichier(s) utilisé(s) pour l&apos;extraction
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
              {documentsUrls.map((url: string, index: number) => {
                const fileName = extractDocumentName(url);
                const fileExt = getFileExtension(url);

                return (
                  <a
                    key={index}
                    href={url}
                    download
                    className="group/doc flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-slate-100 text-slate-500">
                      <FileText className="h-4 w-4" />
                      <span className="text-[8px] font-bold">{fileExt}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{fileName}</p>
                      <p className="text-xs text-slate-500">Document source #{index + 1}</p>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover/doc:text-slate-700" />
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
