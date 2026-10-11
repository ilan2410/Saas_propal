import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { TemplateWizard } from '@/components/templates/TemplateWizard';
import { TemplatePageTourTrigger } from '@/components/onboarding/TemplatePageTourTrigger';
import type { Secteur } from '@/lib/onboarding/onboarding.types';
import { resolveOrgContext } from '@/lib/auth/org-context';

export const revalidate = 0;

export default async function NewTemplatePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) redirect('/login');

  if (!ctx.permissions.manage_templates) redirect('/dashboard');

  // Récupérer l'organisation avec ses champs par défaut
  const { data: organization } = await createServiceClient().from('organizations')
    .select('champs_defaut, secteur')
    .eq('id', ctx.organizationId)
    .single();

  const secteur = organization?.secteur || 'telephonie';

  return (
    <div className="space-y-6">
      {/* Tour guide trigger (activated via ?tour=template in URL) */}
      <Suspense fallback={null}>
        <TemplatePageTourTrigger secteur={secteur as Secteur} />
      </Suspense>

      {/* Header */}
      <div>
        <Link
          href="/templates"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux templates
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Nouveau Template</h1>
        <p className="text-gray-600 mt-2">
          Créez un template en 3 étapes simples
        </p>
      </div>

      {/* Wizard */}
      <TemplateWizard
        defaultFields={organization?.champs_defaut || []}
        secteur={secteur}
      />
    </div>
  );
}
