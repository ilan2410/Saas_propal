import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsPage from '@/components/client/SettingsPage';
import { Organization, Proposition, PropositionTemplate, StripeTransaction } from '@/types';

export default async function Settings() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch Organization
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', user.id)
    .single();

  if (orgError || !organization) {
    // Si pas d'organisation, rediriger vers onboarding ou afficher une erreur
    // Pour l'instant on redirige vers l'accueil
    redirect('/');
  }

  // Fetch Transactions for billing stats
  const { data: transactions, error: transError } = await supabase
    .from('stripe_transactions')
    .select('*')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  const { data: propositions } = await supabase
    .from('propositions')
    .select(
      'id, nom_client, template_id, statut, created_at, exported_at, duplicated_template_url, generated_file_name, source_documents'
    )
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  const { data: templates } = await supabase
    .from('proposition_templates')
    .select('id, nom, file_type, statut')
    .eq('organization_id', user.id)
    .order('created_at', { ascending: false });

  const validTransactions = (transactions || []) as StripeTransaction[];
  const validPropositions = (propositions || []) as Proposition[];
  const validTemplates = (templates || []) as PropositionTemplate[];
  
  // Calculate stats
  const successfulTransactions = validTransactions.filter(t => t.statut === 'succeeded');
  
  const totalSpent = successfulTransactions.reduce((acc, curr) => acc + (curr.montant || 0), 0);
  const transactionCount = successfulTransactions.length;
  
  const lastRechargeTransaction = successfulTransactions.length > 0 ? successfulTransactions[0] : null;
  const lastRecharge = lastRechargeTransaction ? {
    date: lastRechargeTransaction.created_at,
    amount: lastRechargeTransaction.montant
  } : undefined;

  const billingStats = {
    totalSpent,
    transactionCount,
    lastRecharge
  };

  const propositionsCount = validPropositions.length;
  const oldestProposition =
    propositionsCount > 0
      ? validPropositions.reduce((oldest, current) =>
          new Date(current.created_at).getTime() < new Date(oldest.created_at).getTime()
            ? current
            : oldest
        )
      : null;

  return (
    <div className="container mx-auto py-8 px-4">
      <SettingsPage 
        organization={organization as Organization} 
        userEmail={user.email || ''}
        transactions={validTransactions}
        propositions={validPropositions}
        templates={validTemplates}
        propositionsCount={propositionsCount}
        storageUsage={null}
        oldestProposition={oldestProposition ? oldestProposition.created_at : null}
        billingStats={billingStats}
      />
    </div>
  );
}
