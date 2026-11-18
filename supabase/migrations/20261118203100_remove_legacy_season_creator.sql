-- Remove the transitional one-input season creator. All new season creation
-- must submit the explicit Circuit Pool schedule.
drop function if exists public.fia_create_caleris_season(date);
