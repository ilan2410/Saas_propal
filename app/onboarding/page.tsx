import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import OnboardingForm from '@/components/onboarding/OnboardingForm';

export const revalidate = 0;

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = user.user_metadata?.role;
  if (role === 'admin') {
    redirect('/admin/dashboard');
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('secteur')
    .eq('id', user.id)
    .single();

  if (organization?.secteur) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-[calc(100vh-0px)] bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Onboarding</h1>
            <p className="text-gray-600 mt-2">
              Dernière étape : choisissez votre secteur.
            </p>
          </div>

          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
