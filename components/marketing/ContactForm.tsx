'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { CONTACT_SECTORS, CONTACT_TEAM_SIZES } from '@/lib/contact/schema';

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#3d7eff] focus:outline-none focus:ring-2 focus:ring-[#3d7eff]/30';
const label = 'mb-1.5 block text-sm font-semibold text-slate-800';

export function ContactForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    setIsLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: text('full_name'),
          email: text('email'),
          phone: text('phone'),
          company: text('company'),
          sector: text('sector'),
          team_size: text('team_size') || undefined,
          message: text('message') || undefined,
          send_confirmation: form.get('send_confirmation') === 'on',
          consent: form.get('consent') === 'on',
          website: text('website'),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Une erreur est survenue. Réessayez dans un instant.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div
        role="status"
        className="flex flex-col items-center rounded-[1.4rem] border border-[#7793bc]/30 bg-white p-10 text-center shadow-[0_28px_70px_rgba(31,63,108,0.14)]"
      >
        <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <h3 className="text-2xl font-bold text-slate-900">Demande envoyée</h3>
        <p className="mt-3 max-w-[40ch] text-pretty leading-7 text-slate-600">
          Merci ! Notre équipe vous recontactera très prochainement.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[1.4rem] border border-[#7793bc]/30 bg-white p-6 shadow-[0_28px_70px_rgba(31,63,108,0.14)] sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-name" className={label}>
            Nom et prénom <span className="text-red-600">*</span>
          </label>
          <input id="cf-name" name="full_name" type="text" required minLength={2} maxLength={120} autoComplete="name" className={field} placeholder="Jean Dupont" />
        </div>
        <div>
          <label htmlFor="cf-company" className={label}>
            Entreprise <span className="text-red-600">*</span>
          </label>
          <input id="cf-company" name="company" type="text" required minLength={2} maxLength={160} autoComplete="organization" className={field} placeholder="Nom de votre société" />
        </div>
        <div>
          <label htmlFor="cf-email" className={label}>
            Email professionnel <span className="text-red-600">*</span>
          </label>
          <input id="cf-email" name="email" type="email" required maxLength={254} autoComplete="email" className={field} placeholder="vous@entreprise.fr" />
        </div>
        <div>
          <label htmlFor="cf-phone" className={label}>
            Téléphone <span className="text-red-600">*</span>
          </label>
          <input id="cf-phone" name="phone" type="tel" required minLength={6} maxLength={30} autoComplete="tel" className={field} placeholder="06 12 34 56 78" />
        </div>
        <div>
          <label htmlFor="cf-sector" className={label}>
            Secteur d&apos;activité <span className="text-red-600">*</span>
          </label>
          <select id="cf-sector" name="sector" required defaultValue="" className={field}>
            <option value="" disabled>
              Choisir…
            </option>
            {CONTACT_SECTORS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cf-team" className={label}>
            Équipe commerciale <span className="font-normal text-slate-500">(facultatif)</span>
          </label>
          <select id="cf-team" name="team_size" defaultValue="" className={field}>
            <option value="">Non précisé</option>
            {CONTACT_TEAM_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="cf-message" className={label}>
          Message <span className="font-normal text-slate-500">(facultatif)</span>
        </label>
        <textarea id="cf-message" name="message" rows={4} maxLength={500} className={`${field} resize-y`} placeholder="Parlez-nous de votre besoin…" />
      </div>

      {/* Honeypot : invisible pour les humains, rempli par les robots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="cf-website">Ne pas remplir</label>
        <input id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-6 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" name="send_confirmation" className="mt-1 size-4 rounded border-slate-300 text-[#2768e3] focus:ring-[#3d7eff]" />
          <span>Je souhaite recevoir un email de confirmation d&apos;envoi.</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" name="consent" required className="mt-1 size-4 rounded border-slate-300 text-[#2768e3] focus:ring-[#3d7eff]" />
          <span>
            J&apos;accepte d&apos;être recontacté et que mes données soient traitées conformément à la{' '}
            <Link href="/confidentialite" className="font-semibold text-[#2768e3] underline underline-offset-2">
              politique de confidentialité
            </Link>
            . <span className="text-red-600">*</span>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2768e3] px-6 py-3 font-bold text-white transition-colors hover:bg-[#1f57c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#78a9ff] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4" aria-hidden="true" />
        )}
        {isLoading ? 'Envoi en cours…' : 'Être recontacté'}
      </button>
    </form>
  );
}
