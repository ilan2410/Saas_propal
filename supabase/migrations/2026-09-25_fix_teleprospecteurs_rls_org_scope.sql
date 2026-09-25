-- Correctif FINDING-001 (audit sécurité pièces jointes) : la migration
-- 2026-09-24_propositions_team_telepros_attachments.sql avait déjà été
-- appliquée avec des policies d'écriture `teleprospecteurs` basées sur
-- `organization_id = auth.uid()` au lieu de `is_org_member(organization_id)`
-- (incohérent avec la policy SELECT et le reste du projet). Cette migration
-- de suivi recrée les policies déjà présentes en base avec la version
-- corrigée. Idempotent (DROP IF EXISTS + CREATE) : sans risque à rejouer.

DROP POLICY IF EXISTS "Owners can create teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can create teleprospecteurs"
ON public.teleprospecteurs FOR INSERT
WITH CHECK (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can update teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can update teleprospecteurs"
ON public.teleprospecteurs FOR UPDATE
USING (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin')
WITH CHECK (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Owners can delete teleprospecteurs" ON public.teleprospecteurs;
CREATE POLICY "Owners can delete teleprospecteurs"
ON public.teleprospecteurs FOR DELETE
USING (public.is_org_member(organization_id) OR (auth.jwt() ->> 'role') = 'admin');
