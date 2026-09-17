-- ==========================================
-- ROLLBACK de : 2026-09-16_proposition_notes_calendars.sql
-- ==========================================
-- DESTRUCTEUR : ce script supprime définitivement toutes les notes,
-- tous les rappels, toutes les connexions calendrier et tous les états
-- de synchronisation enregistrés par cette migration.
--
-- Les événements déjà créés dans Google Calendar ou Outlook ne sont pas
-- supprimés par ce rollback SQL. Les abonnements webhook externes peuvent
-- continuer à appeler l'application jusqu'à leur expiration, mais seront
-- ignorés puisque leurs enregistrements locaux auront été supprimés.

BEGIN;

DROP TABLE IF EXISTS public.calendar_deletion_jobs CASCADE;
DROP TABLE IF EXISTS public.calendar_subscriptions CASCADE;
DROP TABLE IF EXISTS public.calendar_event_links CASCADE;
DROP TABLE IF EXISTS public.calendar_connections CASCADE;
DROP TABLE IF EXISTS public.calendar_user_settings CASCADE;
DROP TABLE IF EXISTS public.proposition_notes CASCADE;

COMMIT;
