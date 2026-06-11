import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileText,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Package,
  Edit3,
  FileSearch,
  ChevronDown,
  Sparkles,
  ClipboardList,
  Gift,
  TrendingDown,
  MapPin,
  AlertCircle,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';
import { AccordionItem, SuggestionsPanel } from '@/components/propositions/PropositionDetailClient';
import { GenerateButton } from '@/components/propositions/GenerateButton';
import { ActionMenu } from '@/components/propositions/ActionMenu';
import { CopyButton } from '@/components/propositions/CopyButton';
import { ExportButton } from '@/components/propositions/ExportButton';
import { ExportSaSpButtons } from '@/components/propositions/ExportSaSpButtons';
import { SaResumeRenderer } from '@/components/propositions/SaResumeRenderer';
import type { SpObjectifConfig, SpQuestion, SpQuestionReponse, SuggestionsSpCompletes } from '@/types';
import { resolveIndemnites } from '@/lib/sp/calculateCart';
import { evaluateObjectifsForRender } from '@/lib/sp/evaluateObjectifs';
import SpObjectifsAccomplis from '@/components/sp/SpObjectifsAccomplis';

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
}: {
  sp: SuggestionsSpCompletes | null;
  reponses: SpQuestionReponse[];
  questions: SpQuestion[];
  indemnitesResolues: string | null;
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
  const showFas = hasPositiveValue(fasValue);

  // Indemnités : valeur résolue côté serveur (même logique que le comparatif SA/SP)
  const indemnitesValue = indemnitesResolues;
  const showIndemnites = !!indemnitesValue || hasPositiveValue(sp?.sp_remise_mois_offert);
  const adresseFactu = sp?.sp_adresse_facturation;
  const adresseLivr = sp?.sp_adresse_livraison;
  const showAdresses = !!(sp?.sp_fournisseur_propose || adresseFactu);

  return (
    <div className="space-y-5">

      {/* ── Bannière date limite ── */}
      {sp?.sp_date_limite_souscription && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Offre valable jusqu&apos;au <strong>{sp.sp_date_limite_souscription}</strong></span>
        </div>
      )}

      {/* ── Hero section ── */}
      {sp && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Gauche — montant principal */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Total mensuel proposé</p>
              <p className="text-5xl font-extrabold text-gray-900 leading-none">
                {recurrentTotal > 0
                  ? formatEuroValue(recurrentTotal)
                  : sp.sp_total_recurrent || sp.sp_total_propose || '-'}
              </p>

              {/* Durée engagement */}
              {sp.sp_duree_mois && (
                <p className="text-sm text-gray-500 mt-3">
                  Engagement <strong className="text-gray-700">{sp.sp_duree_mois} mois</strong>
                  {sp.sp_mois_offerts ? ` · ${sp.sp_mois_offerts} mois offerts` : ''}
                  {sp.sp_duree_trimestres ? ` (${sp.sp_duree_trimestres} trimestres)` : ''}
                </p>
              )}

              {/* Badge économie */}
              {sp.sp_est_economie === 'Oui' && sp.sp_economie_mensuelle && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">
                    Économie {sp.sp_economie_mensuelle}/mois
                    {sp.sp_economie_annuelle ? ` · ${sp.sp_economie_annuelle}/an` : ''}
                  </span>
                </div>
              )}

              {/* Loyer mensuel */}
              {sp.sp_loyer_mensuel && sp.sp_loyer_mensuel !== '-' && (
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full">
                  <span className="text-sm font-medium text-purple-700">
                    Loyer : {sp.sp_loyer_mensuel}/mois
                    {sp.sp_loyer_trimestriel ? ` · ${sp.sp_loyer_trimestriel}/trim.` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Droite — synthèse rapide */}
            <div className="flex flex-col gap-2.5 justify-center">
              <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                <span className="text-gray-600">Forfaits récurrents</span>
                <span className="font-semibold text-gray-900">
                  {recurrentTotal > 0 ? formatEuroValue(recurrentTotal) : sp.sp_total_recurrent || '-'}
                </span>
              </div>

              {materielTotal > 0 && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600">Matériel (ponctuel)</span>
                  <span className="font-semibold text-gray-900">{formatEuroValue(materielTotal)}</span>
                </div>
              )}

              {showFas && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    FAS / Installation
                  </span>
                  <span className="font-semibold text-gray-900">{fasValue}</span>
                </div>
              )}

              {cadeaux.length > 0 && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5" />
                    Cadeaux / avantages
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {sp?.sp_total_cadeaux_ht || `${cadeaux.length} cadeau${cadeaux.length > 1 ? 'x' : ''}`}
                  </span>
                </div>
              )}

              {sp.sp_remise_mois_offert && hasPositiveValue(sp.sp_remise_mois_offert) && (
                <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-600">Remise mois offerts</span>
                  <span className="font-semibold text-emerald-700">-{sp.sp_remise_mois_offert}</span>
                </div>
              )}

              {indemnitesValue && (
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-gray-600">Indemnités résiliation</span>
                  <span className="font-semibold text-red-600">{indemnitesValue}</span>
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
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Mobiles ({mobileRows.length})</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {mobileRows.map((row, index) => (
                  <div key={index} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{String(row.sp_produit ?? row.sp_nom_ligne ?? '-')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!!row.sp_produit_fournisseur && (
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">{String(row.sp_produit_fournisseur)}</span>
                        )}
                        <span className="text-xs text-gray-500">Qté : {String(row.sp_quantite ?? '1')}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 whitespace-nowrap shrink-0">{String(row.sp_prix_propose ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fixes */}
          {fixeRows.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Fixes ({fixeRows.length})</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {fixeRows.map((row, index) => (
                  <div key={index} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{String(row.sp_produit ?? row.sp_nom_ligne ?? '-')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!!row.sp_produit_fournisseur && (
                          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">{String(row.sp_produit_fournisseur)}</span>
                        )}
                        <span className="text-xs text-gray-500">Qté : {String(row.sp_quantite ?? '1')}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 whitespace-nowrap shrink-0">{String(row.sp_prix_propose ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internet */}
          {internetRows.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Internet ({internetRows.length})</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {internetRows.map((row, index) => (
                  <div key={index} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{String(row.sp_produit ?? row.sp_nom_ligne ?? '-')}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {!!row.sp_produit_fournisseur && (
                          <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full font-medium">{String(row.sp_produit_fournisseur)}</span>
                        )}
                        <span className="text-xs text-gray-500">Qté : {String(row.sp_quantite ?? '1')}</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 whitespace-nowrap shrink-0">{String(row.sp_prix_propose ?? '-')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matériel */}
          {materiel.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Matériel ({materiel.length})</h3>
              </div>
              <div className="divide-y divide-gray-100">
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
                        <img src={String(img)} alt={nom} className="w-10 h-10 rounded-lg object-contain border border-gray-100 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{nom}</p>
                            {ref && <p className="text-xs text-gray-400 mt-0.5">Réf. {ref}</p>}
                            {desc && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{desc}</p>}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {!!fournisseur && (
                                <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full font-medium">{String(fournisseur)}</span>
                              )}
                              {freq && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${freq === 'Achat unique' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-700'}`}>
                                  {freq}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">Qté : {qty}</span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 whitespace-nowrap shrink-0">{prix}</p>
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
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900">FAS / Installation</h3>
              </div>
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">Frais d&apos;accès au service</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">ponctuel</span>
                  <span className="font-semibold text-gray-900">{fasValue}</span>
                </div>
              </div>
            </div>
          )}

          {/* Cadeaux / avantages */}
          {cadeaux.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-gray-500" />
                  Cadeaux / avantages ({cadeaux.length})
                </h3>
                {sp?.sp_total_cadeaux_ht && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{sp.sp_total_cadeaux_ht}</span>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {cadeaux.map((cadeau, index) => (
                  <div key={index} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-gray-900">{cadeau.sp_cadeau_nom}</span>
                    <span className="text-gray-600 whitespace-nowrap">{cadeau.sp_cadeau_valeur_ht}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Indemnités & remises ── */}
      {showIndemnites && sp && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm">Indemnités &amp; remises</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {indemnitesValue && (
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">Indemnités de résiliation</span>
                <span className="font-semibold text-red-600">{indemnitesValue}</span>
              </div>
            )}
            {hasPositiveValue(sp.sp_remise_mois_offert) && (
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">Remise mois offerts{sp.sp_mois_offerts ? ` (${sp.sp_mois_offerts} mois)` : ''}</span>
                <span className="font-semibold text-emerald-700">-{sp.sp_remise_mois_offert}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fournisseur & adresses ── */}
      {showAdresses && sp && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Client &amp; adresses</h3>
          </div>
          <div className="p-4 space-y-4">
            {sp.sp_fournisseur_propose && (
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">Fournisseur proposé</p>
                <p className="text-sm font-semibold text-gray-900">{sp.sp_fournisseur_propose}</p>
              </div>
            )}
            {adresseFactu && (
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">Adresse de facturation</p>
                <p className="text-sm text-gray-800">
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
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">Adresse de livraison</p>
                <p className="text-sm text-gray-800">
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
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Réponses au questionnaire SP ({questionResponses.length})</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {questionResponses.map((reponse, index) => {
              const question = questionsById.get(reponse.question_id);
              return (
                <div key={`${reponse.question_id}-${index}`} className="p-4">
                  <p className="text-sm font-semibold text-gray-900">{question?.libelle || formatFieldName(reponse.question_id)}</p>
                  <p className="text-sm text-gray-600 mt-1">{formatSpValue(reponse.valeur)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!sp && reponses.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-sm">
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

// Formate une valeur potentiellement imbriquée (objet/tableau) en texte lisible
function renderNestedValue(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) {
    return v.map((item) => {
      if (typeof item !== 'object' || item === null) return String(item);
      return Object.entries(item as Record<string, unknown>)
        .filter(([, val]) => val !== null && val !== undefined && val !== '')
        .map(([k, val]) => `${formatFieldName(k)}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
        .join(' | ');
    }).join('\n');
  }
  return Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val !== null && val !== undefined && val !== '')
    .map(([k, val]) => `${formatFieldName(k)}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
    .join(' | ');
}

// Extrait le nom du document
function extractDocumentName(url: string): string {
  try {
    const filename = url.split('/').pop() || 'Document';
    const decodedFilename = decodeURIComponent(filename);
    const cleanName = decodedFilename.replace(/^\d+-/, '');
    return cleanName;
  } catch {
    return 'Document';
  }
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

// Extrait le nom du client
function getClientName(extractedData: unknown): string {
  try {
    const data: Record<string, unknown> = isRecord(extractedData) ? extractedData : {};
    
    if (isRecord(data.client)) {
      const nom = data.client.nom;
      const name = data.client.name;
      if (typeof nom === 'string' && nom) return nom;
      if (typeof name === 'string' && name) return name;
    }
    
    const clientNom = data['client.nom'];
    if (typeof clientNom === 'string' && clientNom) return clientNom;

    const clientPrenom = data['client.prenom'];
    const clientNom2 = data['client.nom'];
    if (typeof clientPrenom === 'string' && clientPrenom && typeof clientNom2 === 'string' && clientNom2) {
      return `${clientPrenom} ${clientNom2}`;
    }
    
    if (typeof data.nom_client === 'string' && data.nom_client) return data.nom_client;
    if (typeof data.client_nom === 'string' && data.client_nom) return data.client_nom;
    
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('client') && isRecord(value)) {
        const nom = value.nom;
        const name = value.name;
        if (typeof nom === 'string' && nom) return nom;
        if (typeof name === 'string' && name) return name;
      }
    }
    
    return 'Client non spécifié';
  } catch {
    return 'Client non spécifié';
  }
}

// Composant pour afficher le statut
function StatusBadge({ statut }: { statut: string }) {
  const configs = {
    draft: {
      icon: Clock,
      label: 'Brouillon',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      iconColor: 'text-amber-600'
    },
    exported: {
      icon: CheckCircle2,
      label: 'Exportée',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      iconColor: 'text-emerald-600'
    },
    error: {
      icon: XCircle,
      label: 'Erreur',
      className: 'bg-red-100 text-red-700 border-red-200',
      iconColor: 'text-red-600'
    },
    extracted: {
      icon: FileSearch,
      label: 'Données extraites',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      iconColor: 'text-blue-600'
    },
    ready: {
      icon: Zap,
      label: 'Prête à générer',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      iconColor: 'text-purple-600'
    },
    processing: {
      icon: Clock,
      label: 'En cours',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      iconColor: 'text-amber-600'
    }
  };

  const config = configs[statut as keyof typeof configs] || configs.processing;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border ${config.className}`}>
      <Icon className={`w-4 h-4 ${config.iconColor}`} />
      {config.label}
    </span>
  );
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

  // Récupérer la proposition avec le template
  const { data: proposition, error } = await supabase
    .from('propositions')
    .select(`
      *,
      template:proposition_templates(*)
    `)
    .eq('id', id)
    .eq('organization_id', user.id)
    .single();

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
  const clientName = getClientName(extractedDataRecord) || proposition.nom_client || 'Proposition sans nom';
  
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
    .eq('id', user.id)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50">
      {/* Header Hero */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Breadcrumb */}
          <Link
            href="/propositions"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm font-medium transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Retour aux propositions
          </Link>

          {/* Header content */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              {/* Client avatar + name */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-blue-500/30">
                  {clientName[0]?.toUpperCase() || 'C'}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {clientName}
                  </h1>
                  <div className="flex items-center gap-3 mt-2">
                    <StatusBadge statut={proposition.statut} />
                    <span className="text-sm text-gray-500 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDate(proposition.created_at, 'long')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {/* Bouton Reprendre (brouillon) */}
              {['draft', 'ready', 'extracted'].includes(proposition.statut) && (
                <Link
                  href={`/propositions/${proposition.id}/resume`}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all font-semibold shadow-lg shadow-amber-500/30 hover:scale-105"
                >
                  <Edit3 className="w-5 h-5" />
                  Reprendre
                </Link>
              )}

              {/* Bouton Générer */}
              {['ready', 'extracted'].includes(proposition.statut) && 
               !proposition.duplicated_template_url && 
               !proposition.fichier_genere_url && (
                <GenerateButton propositionId={proposition.id} variant="primary" />
              )}
              
              {/* Bouton Télécharger */}
              {(proposition.duplicated_template_url || proposition.fichier_genere_url) && (
                <a
                  href={proposition.duplicated_template_url || proposition.fichier_genere_url}
                  download
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all font-semibold shadow-lg shadow-emerald-500/30 hover:scale-105"
                >
                  <Download className="w-5 h-5" />
                  Télécharger
                </a>
              )}

              {/* Comparatif SA/SP si données SP disponibles */}
              {proposition.suggestions_sp_completes && (
                <ExportSaSpButtons propositionId={proposition.id} />
              )}

              {/* Menu actions */}
              <ActionMenu propositionId={proposition.id} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Client */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl group-hover:scale-110 transition-transform">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Client</h3>
            </div>
            <p className="text-xl font-bold text-gray-900 truncate">
              {clientName}
            </p>
          </div>

          {/* Template */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Template</h3>
            </div>
            <p className="text-xl font-bold text-gray-900 truncate">
              {typeof template?.nom === 'string' ? template.nom : 'N/A'}
            </p>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-orange-100 to-orange-50 rounded-xl group-hover:scale-110 transition-transform">
                <Package className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Documents</h3>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {documentsUrls.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">fichier(s) source</p>
          </div>

          {/* Champs extraits */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl group-hover:scale-110 transition-transform">
                <FileSearch className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-gray-600 text-sm">Données</h3>
            </div>
            <p className="text-xl font-bold text-gray-900">
              {totalFields}
            </p>
            <p className="text-xs text-gray-500 mt-1">champs extraits</p>
          </div>
        </div>

        {/* Timeline / Progress (si statut en cours) */}
        {proposition.statut === 'processing' && (
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 animate-spin" />
              <h3 className="text-lg font-bold">Génération en cours...</h3>
            </div>
            <div className="w-full bg-blue-400/30 rounded-full h-2">
              <div className="bg-white h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
            <p className="text-sm text-blue-100 mt-3">
              Votre proposition est en cours de création. Cela peut prendre quelques instants.
            </p>
          </div>
        )}

        {/* Documents sources */}
        {documentsUrls.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Documents sources
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {documentsUrls.length} fichier(s) utilisé(s) pour l&apos;extraction
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documentsUrls.map((url: string, index: number) => {
                  const fileName = extractDocumentName(url);
                  const fileExt = getFileExtension(url);
                  
                  return (
                    <a
                      key={index}
                      href={url}
                      download
                      className="group flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-300"
                    >
                      {/* File icon with extension */}
                      <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex flex-col items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                        <FileText className="w-6 h-6 mb-0.5" />
                        <span className="text-[9px] font-bold">{fileExt}</span>
                      </div>
                      
                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {fileName}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Document source #{index + 1}
                        </p>
                      </div>
                      
                      {/* Download icon */}
                      <Download className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!!resume.trim() && (
          <details className="group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Résumé SA</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Synthèse automatique basée sur les documents sources
                      </p>
                    </div>
                  </div>

                  <ChevronDown className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-180" />
                </div>
              </div>
            </summary>

            <div className="p-6">
              <SaResumeRenderer text={resume} donneesExtraites={extractedDataRecord} />
            </div>
          </details>
        )}

        {hasSuggestionsGenerees(suggestionsGenerees) && (
          <details className="group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Sparkles className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Suggestions IA</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Comparatif calculé à partir des données de la proposition
                      </p>
                    </div>
                  </div>

                  <ChevronDown className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-180" />
                </div>
              </div>
            </summary>

            <div className="p-6">
              <SuggestionsPanel
                propositionId={proposition.id}
                clientName={clientName}
                suggestions={suggestionsGenerees}
                embedded
              />
            </div>
          </details>
        )}

        {(suggestionsSpCompletes || spReponses.length > 0) && (
          <details className="group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ClipboardList className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Résumé SP</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Synthèse de la situation proposée, du panier SP et des réponses au questionnaire
                      </p>
                    </div>
                  </div>

                  <ChevronDown className="w-5 h-5 text-gray-500 transition-transform group-open:rotate-180" />
                </div>
              </div>
            </summary>

            <div className="p-6">
              <SpResumePanel sp={suggestionsSpCompletes} reponses={spReponses} questions={spQuestions} indemnitesResolues={indemnitesResoluesStr} />
              <ObjectifsSection
                objectifsConfig={spObjectifsConfig}
                templateId={templateId ?? ''}
                reponses={spReponses}
                sp={suggestionsSpCompletes}
              />
            </div>
          </details>
        )}

      </div>
    </div>
  );
}
