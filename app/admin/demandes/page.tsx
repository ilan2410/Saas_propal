import { Building2, Mail, MessageSquare, Phone, Users } from 'lucide-react';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ContactRequestActions } from '@/components/admin/ContactRequestActions';
import { sectorLabel, teamSizeLabel } from '@/lib/contact/schema';

export const revalidate = 0;

type ContactRequest = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  company: string;
  sector: string;
  team_size: string | null;
  message: string | null;
  confirmation_requested: boolean;
  status: string;
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

export default async function ContactRequestsPage() {
  const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabaseAdmin
    .from('contact_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const requests = (data ?? []) as ContactRequest[];
  const pending = requests.filter((r) => r.status === 'nouveau');
  const handled = requests.filter((r) => r.status === 'traite');

  const renderCard = (r: ContactRequest) => (
    <article key={r.id} className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{r.full_name}</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                r.status === 'nouveau' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {r.status === 'nouveau' ? 'Nouveau' : 'Traité'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{formatDateTime(r.created_at)}</p>
        </div>
        <ContactRequestActions id={r.id} status={r.status} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-400" />
          <dt className="sr-only">Entreprise</dt>
          <dd>
            {r.company} · {sectorLabel(r.sector)}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <dt className="sr-only">Équipe commerciale</dt>
          <dd>{teamSizeLabel(r.team_size)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-400" />
          <dt className="sr-only">Email</dt>
          <dd>
            <a href={`mailto:${r.email}`} className="text-blue-600 hover:underline">
              {r.email}
            </a>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-gray-400" />
          <dt className="sr-only">Téléphone</dt>
          <dd>
            <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="text-blue-600 hover:underline">
              {r.phone}
            </a>
          </dd>
        </div>
      </dl>

      {r.message && (
        <div className="mt-4 flex gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <p className="whitespace-pre-wrap">{r.message}</p>
        </div>
      )}

      {r.confirmation_requested && (
        <p className="mt-3 text-xs text-gray-500">Le demandeur a reçu un accusé de réception par email.</p>
      )}
    </article>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Demandes de contact</h1>
        <p className="mt-2 text-gray-600">
          Personnes qui ont demandé à être recontactées depuis la page d&apos;accueil.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les demandes. La migration <code>2026-11-12_contact_requests.sql</code> a-t-elle été
          appliquée ?
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">À traiter ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Aucune nouvelle demande.
          </p>
        ) : (
          pending.map(renderCard)
        )}
      </section>

      {handled.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Traitées ({handled.length})</h2>
          {handled.map(renderCard)}
        </section>
      )}
    </div>
  );
}
