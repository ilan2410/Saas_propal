-- Ajout de la policy RLS pour permettre aux clients d'insérer leurs propres transactions Stripe

-- stripe_transactions: INSERT pour l'organisation du user
DROP POLICY IF EXISTS "Users can insert their own transactions" ON stripe_transactions;

CREATE POLICY "Users can insert their own transactions"
ON stripe_transactions FOR INSERT
WITH CHECK (
  organization_id = auth.uid()
  OR (auth.jwt() ->> 'role') = 'admin'
);
