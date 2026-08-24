import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EditTemplateForm } from '@/components/templates/EditTemplateForm';
import { resolveOrgContext } from '@/lib/auth/org-context';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ctx = await resolveOrgContext(supabase, user);
  if (!ctx) redirect('/login');

  // Récupérer le secteur et les champs par défaut de l'organisation
  const { data: organization } = await supabase
    .from('organizations')
    .select('secteur, champs_defaut')
    .eq('id', ctx.organizationId)
    .single();

  return (
    <EditTemplateForm 
      templateId={id} 
      secteur={organization?.secteur || 'telephonie'} 
      defaultFields={organization?.champs_defaut || []}
    />
  );
}
