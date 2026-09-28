-- Annule 2026-09-28_ai_usage_events.sql
DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org(UUID);
DROP FUNCTION IF EXISTS public.admin_storage_usage_by_org();
DROP POLICY IF EXISTS "Admins can view ai usage events" ON public.ai_usage_events;
DROP TABLE IF EXISTS public.ai_usage_events;
DELETE FROM public.platform_settings WHERE key = 'usd_to_eur_rate';
