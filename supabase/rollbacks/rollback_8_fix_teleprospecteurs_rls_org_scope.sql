-- Annule le correctif FINDING-001 : recrée les policies telles qu'elles
-- étaient avant 2026-09-25_fix_teleprospecteurs_rls_org_scope.sql.
-- Ne pas exécuter sauf besoin explicite de revenir à l'état précédent
-- (qui contenait le bug d'autorisation corrigé par cette migration).

DROP POLICY IF EXISTS "Owners can create teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can create teleprospecteurs"
ON public.teleprospecteurs FOR INSERT
WITH CHECK (organization_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can update teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can update teleprospecteurs"
ON public.teleprospecteurs FOR UPDATE
USING (organization_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin')
WITH CHECK (organization_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can delete teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can delete teleprospecteurs"
ON public.teleprospecteurs FOR DELETE
USING (organization_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin');
