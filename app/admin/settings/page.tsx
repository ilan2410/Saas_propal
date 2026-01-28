import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PromptDefaultsForm } from '@/components/admin/PromptDefaultsForm';

export const revalidate = 0;

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (user.user_metadata?.role !== 'admin') {
    redirect('/dashboard');
  }

  const supabaseAdmin = createServiceClient();
  const { data: promptDefaults } = await supabaseAdmin
    .from('prompt_defaults')
    .select('secteur,prompt_template,updated_at')
    .order('secteur', { ascending: true });

  type PromptDefaultRow = {
    secteur: 'telephonie' | 'bureautique' | 'mixte';
    prompt_template: string | null;
    updated_at: string | null;
  } & Record<string, unknown>;

  const initialPromptDefaults: PromptDefaultRow[] = Array.isArray(promptDefaults)
    ? (promptDefaults as PromptDefaultRow[])
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-600 mt-2">
          Configuration globale de la plateforme.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <PromptDefaultsForm initialPromptDefaults={initialPromptDefaults} />
      </div>
    </div>
  );
}
