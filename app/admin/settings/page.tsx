import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PromptDefaultsForm } from '@/components/admin/PromptDefaultsForm';
import { PlatformSettingsForm } from '@/components/admin/PlatformSettingsForm';
import { Euro, MessageSquare, Settings } from 'lucide-react';

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

  const [promptDefaultsResult, platformSettingsResult] = await Promise.all([
    supabaseAdmin
      .from('prompt_defaults')
      .select('secteur,prompt_template,updated_at')
      .order('secteur', { ascending: true }),
    supabaseAdmin
      .from('platform_settings')
      .select('key,value,updated_at'),
  ]);

  type PromptDefaultRow = {
    secteur: 'telephonie' | 'bureautique' | 'mixte';
    prompt_template: string | null;
    updated_at: string | null;
  } & Record<string, unknown>;

  const initialPromptDefaults: PromptDefaultRow[] = Array.isArray(promptDefaultsResult.data)
    ? (promptDefaultsResult.data as PromptDefaultRow[])
    : [];

  const settingsMap = new Map<string, number | string>(
    (platformSettingsResult.data || []).map((s) => [s.key, s.value as number | string])
  );
  const tarifDefaut = Number(settingsMap.get('tarif_par_proposition_defaut') ?? 5);

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gray-100 rounded-xl">
          <Settings className="w-7 h-7 text-gray-700" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
          <p className="text-gray-600 mt-1">
            Configuration globale de la plateforme.
          </p>
        </div>
      </div>

      {/* Section 1 : Tarification */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <Euro className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tarification</h2>
            <p className="text-sm text-gray-500">Prix par défaut des propositions pour les nouveaux clients</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <PlatformSettingsForm initialTarifDefaut={tarifDefaut} />
        </div>
      </section>

      {/* Section 2 : Prompts IA */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <MessageSquare className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Prompts IA par défaut</h2>
            <p className="text-sm text-gray-500">Templates de prompt utilisés lors de la création d&apos;un nouveau template</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <PromptDefaultsForm initialPromptDefaults={initialPromptDefaults} />
        </div>
      </section>
    </div>
  );
}
