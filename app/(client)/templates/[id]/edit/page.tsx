import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EditTemplateForm } from '@/components/templates/EditTemplateForm';

export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Récupérer le secteur et les champs par défaut de l'organisation
  const { data: organization } = await supabase
    .from('organizations')
    .select('secteur, champs_defaut')
    .eq('id', user.id)
    .single();

  return (
    <EditTemplateForm 
      templateId={id} 
      secteur={organization?.secteur || 'telephonie'} 
      defaultFields={organization?.champs_defaut || []}
    />
  );
}
